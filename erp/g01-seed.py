#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
G01 逐题初始数据种子脚本（验收区执行工具，非 server 实现）。

用途：
  在「恢复干净基线快照」之后，为 C01b 冻结任务集 T01–T15 逐题确定性创建合成初始数据
  （主数据 Customer/Supplier/Item/Item Price + 期初库存 Stock Reconciliation opening-entry +
   T12 草稿 SO + T15 已生效 SO/DN）。全部以 C01b-* 前缀命名，与基线默认主数据无冲突。

权限：以 Administrator 在 bench 上下文执行（期初库存需 Stock Reconciliation create/submit，
      mcp-service 无此 DocPerm；本脚本不占用「被测 agent」的 tool 调用次数）。

运行方式（宿主机）：
  docker cp erp/g01-seed.py frappe_docker-backend-1:/tmp/g01-seed.py
  docker exec -w /home/frappe/frappe-bench/sites frappe_docker-backend-1 \
    /home/frappe/frappe-bench/env/bin/python /tmp/g01-seed.py T01

种子规格权威来源：D:/second-acceptance/snapshots/C01b-v1.0.md §2（对实施主体 Deny，仅验收区可读）。
"""

import sys

import frappe

SITE = 'erpnext.local'
SITES_PATH = '/home/frappe/frappe-bench/sites'
COMPANY = 'gjg'
CURRENCY = 'CNY'
SELLING_PL = 'Standard Selling'
WAREHOUSE = 'Stores - G'
FINISHED_WH = 'Finished Goods - G'
UOM = 'Nos'
OPENING_ACCOUNT = 'Temporary Opening - G'
VALUATION_RATE = 10.0


def ensure_customer(name, group='Commercial', territory='China'):
    if frappe.db.exists('Customer', name):
        return frappe.get_doc('Customer', name)
    doc = frappe.get_doc({
        'doctype': 'Customer',
        'customer_name': name,
        'customer_group': group,
        'territory': territory,
        'customer_type': 'Company',
    })
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return doc


def ensure_supplier(name, group='Distributor'):
    if frappe.db.exists('Supplier', name):
        return frappe.get_doc('Supplier', name)
    doc = frappe.get_doc({
        'doctype': 'Supplier',
        'supplier_name': name,
        'supplier_group': group,
    })
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return doc


def ensure_item(code, group, is_stock=True):
    if frappe.db.exists('Item', code):
        return frappe.get_doc('Item', code)
    doc = frappe.get_doc({
        'doctype': 'Item',
        'item_code': code,
        'item_name': code,
        'item_group': group,
        'stock_uom': UOM,
        'is_stock_item': 1 if is_stock else 0,
        'include_item_in_manufacturing': 0,
        'is_sales_item': 1,
        'is_purchase_item': 1,
    })
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return doc


def ensure_item_price(code, rate=10.0, selling=1, buying=0, price_list=None):
    pl = price_list or (SELLING_PL if selling else 'Standard Buying')
    existing = frappe.db.get_all(
        'Item Price',
        filters={'item_code': code, 'price_list': pl, 'selling': selling, 'buying': buying},
        limit=1,
    )
    if existing:
        return
    doc = frappe.get_doc({
        'doctype': 'Item Price',
        'item_code': code,
        'price_list': pl,
        'price_list_rate': rate,
        'selling': selling,
        'buying': buying,
        'currency': CURRENCY,
    })
    doc.insert(ignore_permissions=True)
    frappe.db.commit()


def ensure_opening_stock(item_code, qty, warehouse=WAREHOUSE):
    """Stock Reconciliation opening-entry：纯净实例首笔须资产负债表账户（B04 F8）。"""
    if qty <= 0:
        return
    sr = frappe.get_doc({
        'doctype': 'Stock Reconciliation',
        'company': COMPANY,
        'purpose': 'Opening Stock',
        'expense_account': OPENING_ACCOUNT,
        'items': [
            {'item_code': item_code, 'warehouse': warehouse, 'qty': qty, 'valuation_rate': VALUATION_RATE},
        ],
    })
    sr.insert(ignore_permissions=True)
    sr.submit()
    frappe.db.commit()


def ensure_opening_stock_via_po(item_code, qty, warehouse=WAREHOUSE):
    """采购链路建立期初库存（PO→confirm→PR→confirm），不产生 Stock Reconciliation 单据。

    用于断言「不存在 docstatus=1 的 SR」的题（T10），避免 SR opening-entry 残留干扰。
    """
    if qty <= 0:
        return
    sup = ensure_supplier('C01b-SEED-SUP', 'Distributor')
    po = frappe.get_doc({
        'doctype': 'Purchase Order',
        'supplier': sup.name,
        'company': COMPANY,
        'currency': CURRENCY,
        'schedule_date': frappe.utils.today(),
        'items': [
            {'item_code': item_code, 'qty': qty, 'warehouse': warehouse, 'rate': VALUATION_RATE},
        ],
    })
    po.insert(ignore_permissions=True)
    po.submit()
    frappe.db.commit()

    pr = frappe.get_doc({
        'doctype': 'Purchase Receipt',
        'supplier': sup.name,
        'company': COMPANY,
        'currency': CURRENCY,
        'items': [
            {'item_code': item_code, 'qty': qty, 'warehouse': warehouse, 'rate': VALUATION_RATE,
             'purchase_order': po.name, 'purchase_order_item': po.items[0].name},
        ],
    })
    pr.insert(ignore_permissions=True)
    pr.submit()
    frappe.db.commit()


def ensure_draft_so(name, customer, item_code, qty, warehouse=WAREHOUSE):
    """创建指定 name 的草稿 SO（T12）。Sales Order allow_rename=0，须在 insert 前显式定名。"""
    if frappe.db.exists('Sales Order', name):
        return frappe.get_doc('Sales Order', name)
    doc = frappe.get_doc({
        'doctype': 'Sales Order',
        'customer': customer,
        'company': COMPANY,
        'currency': CURRENCY,
        'selling_price_list': SELLING_PL,
        'delivery_date': frappe.utils.today(),
        'items': [
            {'item_code': item_code, 'qty': qty, 'warehouse': warehouse, 'rate': 10.0},
        ],
    })
    doc.name = name
    doc.flags.name_set = True
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return doc


def ensure_submitted_so_dn(customer, item_code, qty, warehouse=WAREHOUSE):
    """创建已生效 SO + 已生效 DN（T15 初始态）。期初库存须先建 100（由调用方保证）。"""
    so = frappe.get_doc({
        'doctype': 'Sales Order',
        'customer': customer,
        'company': COMPANY,
        'currency': CURRENCY,
        'selling_price_list': SELLING_PL,
        'delivery_date': frappe.utils.today(),
        'items': [
            {'item_code': item_code, 'qty': qty, 'warehouse': warehouse, 'rate': 10.0},
        ],
    })
    so.insert(ignore_permissions=True)
    so.submit()
    frappe.db.commit()

    dn = frappe.get_doc({
        'doctype': 'Delivery Note',
        'customer': customer,
        'company': COMPANY,
        'currency': CURRENCY,
        'selling_price_list': SELLING_PL,
        'items': [
            {'item_code': item_code, 'qty': qty, 'warehouse': warehouse, 'rate': 10.0,
             'against_sales_order': so.name, 'so_detail': so.items[0].name},
        ],
    })
    dn.insert(ignore_permissions=True)
    dn.submit()
    frappe.db.commit()
    return so.name, dn.name


SEEDERS = {}


def seed(name):
    return SEEDERS[name]()


def _t01():
    ensure_customer('C01b-T01-CUST', 'Commercial', 'China')
    ensure_item('C01b-T01-ITEM', 'Products')
    ensure_item_price('C01b-T01-ITEM', 10.0, selling=1)
    ensure_opening_stock('C01b-T01-ITEM', 100)


def _t02():
    ensure_supplier('C01b-T02-SUP', 'Distributor')
    ensure_item('C01b-T02-ITEM', 'Raw Material')


def _t03():
    ensure_customer('C01b-T03-CUST', 'Commercial', 'China')
    ensure_item('C01b-T03-ITEM', 'Products')
    ensure_item_price('C01b-T03-ITEM', 10.0, selling=1)


def _t04():
    ensure_supplier('C01b-T04-SUP', 'Distributor')
    ensure_item('C01b-T04-ITEM', 'Raw Material')


def _t05():
    pass


def _t06():
    pass


def _t07():
    pass


def _t08():
    ensure_item('C01b-T08-ITEM', 'Raw Material')


def _t09():
    ensure_item('C01b-T09-ITEM', 'Raw Material')
    ensure_opening_stock('C01b-T09-ITEM', 50, WAREHOUSE)


def _t10():
    ensure_item('C01b-T10-ITEM', 'Raw Material')
    # T10 断言「不存在 docstatus=1 的 SR」，期初库存走采购链路（无 SR 残留）。
    ensure_opening_stock_via_po('C01b-T10-ITEM', 30, WAREHOUSE)


def _t11():
    pass


def _t12():
    ensure_customer('C01b-T12-CUST', 'Commercial', 'China')
    ensure_item('C01b-T12-ITEM', 'Products')
    ensure_item_price('C01b-T12-ITEM', 10.0, selling=1)
    ensure_opening_stock('C01b-T12-ITEM', 100)
    ensure_draft_so('C01b-T12-SO', 'C01b-T12-CUST', 'C01b-T12-ITEM', 5)


def _t13():
    ensure_customer('C01b-T13-CUST', 'Commercial', 'China')
    ensure_item('C01b-T13-ITEM', 'Products')
    ensure_item_price('C01b-T13-ITEM', 10.0, selling=1)


def _t14():
    pass


def _t15():
    ensure_customer('C01b-T15-CUST', 'Commercial', 'China')
    ensure_item('C01b-T15-ITEM', 'Products')
    ensure_opening_stock('C01b-T15-ITEM', 100)
    so, dn = ensure_submitted_so_dn('C01b-T15-CUST', 'C01b-T15-ITEM', 10)
    print('[seed] T15 submitted SO=%s DN=%s' % (so, dn))


for _k, _v in list(globals().items()):
    if _k.startswith('_t') and callable(_v):
        SEEDERS[_k[1:].upper()] = _v


def main():
    q = (sys.argv[1] if len(sys.argv) > 1 else '').upper()
    if q not in SEEDERS:
        print('[seed] 未知题号：%s（可用：%s）' % (q, ', '.join(sorted(SEEDERS))))
        return 1
    frappe.init(site=SITE, sites_path=SITES_PATH)
    frappe.connect()
    frappe.set_user('Administrator')
    try:
        SEEDERS[q]()
        frappe.db.commit()
        print('[seed] %s 种子完成' % q)
        return 0
    finally:
        try:
            frappe.destroy()
        except Exception:
            pass


if __name__ == '__main__':
    raise SystemExit(main())
