#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
E01 配置重放脚本：重建「普通 MCP 调用方」后端主体（mcp-service + MCP Business Caller 23 DocPerm + API token）。

用途：
  在「快照归零」流程中，恢复到 pre-E01 干净快照（如 baseline-20260914-095506.sql）后，
  本脚本重建 E01 落地的正式账号/角色/最小权限，得到「干净 post-E01」基线，再打快照供 G01 使用。

前置：
  - 后端容器运行中；以 Administrator 权限（bench 上下文）执行。
  - 站点 erpnext.local；bench 根目录 /home/frappe/frappe-bench。

运行方式（宿主机执行；注意 -w 必须是 sites 子目录，否则 database.log 相对路径解析错位）：
  docker cp erp/replay-e01.py frappe_docker-backend-1:/tmp/replay-e01.py
  docker exec -w /home/frappe/frappe-bench/sites frappe_docker-backend-1 \
    /home/frappe/frappe-bench/env/bin/python /tmp/replay-e01.py

幂等：脚本可重复执行；已存在的角色/账号会被复用，DocPerm 会按下方清单重设为权威值，
     API token 每次重新生成并写回 /tmp/mcp_token.txt。

验证：脚本末尾自动核对 tabDocPerm（应 23 行、Account/Cost Center 仅 read+select）与账号角色。
"""

import os

import frappe

# ---------------------------------------------------------------------------
# 配置（如环境路径不同，改这里）
# ---------------------------------------------------------------------------
SITE = 'erpnext.local'
SITES_PATH = '/home/frappe/frappe-bench/sites'
ROLE = 'MCP Business Caller'
USER_EMAIL = 'mcp-service@erpnext.local'
TOKEN_PATH = '/tmp/mcp_token.txt'

# ---------------------------------------------------------------------------
# 23 DocPerm 权威清单（E01 permission-matrix.md §3 / roles.md §3；与后端实测一致）
# 字段顺序：(read, write, create, submit, cancel, select)
# delete/amend/report/import/export/share/print/email/set_user_permissions 一律 0（脚本内统一置 0）
# ---------------------------------------------------------------------------
DOCPERMS = {
    # 操作-读写（9）
    'Customer':             (1, 1, 1, 0, 0, 0),
    'Supplier':             (1, 1, 1, 0, 0, 0),
    'Item':                 (1, 1, 1, 0, 0, 0),
    'Item Price':           (1, 1, 1, 0, 0, 0),
    'Sales Order':          (1, 1, 1, 1, 1, 0),
    'Purchase Order':       (1, 1, 1, 1, 1, 0),
    'Purchase Receipt':     (1, 1, 1, 1, 0, 0),
    'Delivery Note':        (1, 1, 1, 1, 0, 0),
    'Stock Entry':          (1, 1, 1, 1, 0, 0),
    # 操作-只读（3）
    'Stock Reconciliation': (1, 0, 0, 0, 0, 0),
    'Bin':                  (1, 0, 0, 0, 0, 0),
    'Stock Ledger Entry':   (1, 0, 0, 0, 0, 0),
    # 引用-只读（9）
    'Company':              (1, 0, 0, 0, 0, 0),
    'Warehouse':            (1, 0, 0, 0, 0, 0),
    'Price List':           (1, 0, 0, 0, 0, 0),
    'Currency':             (1, 0, 0, 0, 0, 0),
    'Customer Group':       (1, 0, 0, 0, 0, 0),
    'Supplier Group':       (1, 0, 0, 0, 0, 0),
    'Territory':            (1, 0, 0, 0, 0, 0),
    'Item Group':           (1, 0, 0, 0, 0, 0),
    'UOM':                  (1, 0, 0, 0, 0, 0),
    # 框架级只读依赖（2，read+select，供交易单据 Link 解析，不可写）
    'Account':              (1, 0, 0, 0, 0, 1),
    'Cost Center':          (1, 0, 0, 0, 0, 1),
}

DENY_FLAGS = {
    'delete': 0, 'amend': 0, 'report': 0, 'import': 0, 'export': 0,
    'share': 0, 'print': 0, 'email': 0, 'set_user_permissions': 0, 'if_owner': 0,
}


def ensure_role():
    """创建/复用角色，并直接写 tabDocPerm（23 个 DocType 权威值）。

    注意：不能走 frappe.get_doc('DocType', dt).save()——标准 DocType 在非 Developer Mode 下
    保存会抛 CannotCreateStandardDoctypeError。权限记录（DocPerm，parent=DocType / role=本角色）
    直接以子表文档 insert 写入，避开 DocType 的 validate/check_developer_mode。
    """
    if frappe.db.exists('Role', ROLE):
        print('[role] 角色已存在：', ROLE)
    else:
        frappe.get_doc({
            'doctype': 'Role',
            'role_name': ROLE,
            'desk_access': 0,
        }).insert(ignore_permissions=True)
        print('[role] 已创建角色：', ROLE)

    # 清空该角色既有 DocPerm（幂等重放）
    frappe.db.sql('DELETE FROM `tabDocPerm` WHERE `role`=%s', (ROLE,))

    for dt, (read, write, create, submit, cancel, select) in DOCPERMS.items():
        row = {
            'doctype': 'DocPerm',
            'parent': dt,
            'parenttype': 'DocType',
            'parentfield': 'permissions',
            'role': ROLE,
            'permlevel': 0,
            'read': read, 'write': write, 'create': create,
            'submit': submit, 'cancel': cancel, 'select': select,
            'idx': 1,
        }
        row.update(DENY_FLAGS)
        frappe.get_doc(row).insert(ignore_permissions=True)
        print('[perm ] %-22s r=%d w=%d c=%d sub=%d can=%d sel=%d' % (dt, read, write, create, submit, cancel, select))

    frappe.db.commit()
    frappe.clear_cache()


def ensure_user():
    """创建/复用 mcp-service 账号，仅挂 MCP Business Caller 角色，不授任何标准角色。"""
    if frappe.db.exists('User', USER_EMAIL):
        user = frappe.get_doc('User', USER_EMAIL)
        print('[user] 账号已存在：', USER_EMAIL)
    else:
        user = frappe.get_doc({
            'doctype': 'User',
            'email': USER_EMAIL,
            'first_name': 'MCP Service',
            'user_type': 'System User',
            'enabled': 1,
            'send_welcome_email': 0,
        })
        user.insert(ignore_permissions=True)
        print('[user] 已创建账号：', USER_EMAIL)

    # 角色收敛到仅 MCP Business Caller
    user.roles = []
    user.append('roles', {'role': ROLE})
    user.enabled = 1
    user.save(ignore_permissions=True)
    frappe.db.commit()
    print('[user] 角色已收敛为：', [r.role for r in user.roles])


def generate_token():
    """生成 API token，写回 /tmp/mcp_token.txt（容器内）。"""
    from frappe.core.doctype.user.user import generate_keys
    # v15 的 generate_keys 返回 dict {'api_key': ..., 'api_secret': ...}，不是字符串
    result = generate_keys(USER_EMAIL)
    api_key = result['api_key']
    api_secret = result['api_secret']
    token_line = 'token %s:%s' % (api_key, api_secret)
    with open(TOKEN_PATH, 'w') as f:
        f.write(token_line + '\n')
    os.chmod(TOKEN_PATH, 0o600)
    frappe.db.commit()
    print('[token] 已写入 %s（长度 %d，值脱敏）' % (TOKEN_PATH, len(token_line)))


def verify():
    """自检：DocPerm 应为 23 行；Account/Cost Center 仅 read+select；账号仅挂本角色。"""
    rows = frappe.db.get_all(
        'DocPerm',
        filters={'role': ROLE, 'parenttype': 'DocType'},
        fields=['parent', 'read', 'write', 'create', 'submit', 'cancel', 'select'],
    )
    print('\n[verify] DocPerm 行数 = %d（应为 23）' % len(rows))
    for r in rows:
        if r['parent'] in ('Account', 'Cost Center'):
            ok = (r['read'] == 1 and r['select'] == 1 and r['write'] == 0
                  and r['create'] == 0 and r['submit'] == 0 and r['cancel'] == 0)
            print('[verify] %-14s read=%d select=%d write=%d -> %s'
                  % (r['parent'], r['read'], r['select'], r['write'], 'OK' if ok else 'FAIL'))
    user = frappe.get_doc('User', USER_EMAIL)
    roles = [r.role for r in user.roles]
    print('[verify] 账号角色 = %s（应仅 [%s]）' % (roles, ROLE))
    ok = len(rows) == 23 and all(
        (r['parent'] not in ('Account', 'Cost Center')) or
        (r['read'] == 1 and r['select'] == 1 and r['write'] == 0 and r['submit'] == 0 and r['cancel'] == 0)
        for r in rows
    )
    print('[verify] 结论：%s' % ('PASS' if ok else 'FAIL'))
    return ok


def main():
    frappe.init(site=SITE, sites_path=SITES_PATH)
    frappe.connect()
    frappe.set_user('Administrator')  # 以管理员身份执行（generate_keys 有 System Manager 校验）
    try:
        ensure_role()
        ensure_user()
        generate_token()
        ok = verify()
        frappe.db.commit()
        print('\n[result] E01 配置重放完成：%s' % ('通过' if ok else '需人工核对'))
        return 0 if ok else 1
    finally:
        try:
            frappe.destroy()
        except Exception:
            pass


if __name__ == '__main__':
    raise SystemExit(main())
