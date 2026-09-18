# F04 修复记录：G01 退回 #23 `stock_transfer_create` 后端 `stock_entry_type` 映射

> 文档性质：F04 v1.0 一处实现缺陷的修复记录（对应退回记录 `docs/task-records/returns/RTN-20260918-G01-001.md`）。修复未触及 D02 契约语义、权限、对象范围或验收题，属原授权范围内的实现侧修正，无需走变更流程（总则 §14）。
> 修复主体：未读 C01b 冻结任务集正文/断言的独立 F04 修复上下文。

## 1. 缺陷与根因

- **缺陷位置**：`server/src/tools/stock-transfer-create.js` 第 147 行。
- **缺陷**：后端写 `doc` 时把 `stock_entry_type` 写成了契约枚举 `'material_transfer'`（下划线），未映射为后端 Stock Entry Type 的 Link 实际值 `'Material Transfer'`。
- **根因证据**：
  1. D02 `tool-contract.md` §6.1 冻结 `stock_entry_type` 输入枚举为 `material_transfer`（「固定 material_transfer，server 校验，后端不强制，B04 F9」）——这是 **agent 语义枚举**，server 负责校验并落到后端。
  2. B04 `interface-facts.md` §2.1 已实测：后端 Stock Entry 的 `stock_entry_type` 是 Link → Stock Entry Type，正确值为 `Material Transfer`，`purpose` 由它派生为 `Material Transfer`，`from_warehouse`/`to_warehouse` 为 Material Transfer 必填。
  3. 因后端 Link 校验不强制（B04 F9），`'material_transfer'` 被 200 接受，但 `purpose` 退化为 `Material Issue`、`to_warehouse` 被丢弃；`erpnext_stock_transfer_confirm`（#24）前置断言读到草稿缺 `to_warehouse`，报「调拨单缺源/目标仓」。

## 2. 修复内容

仅改第 147 行——后端写 `doc` 时把契约枚举映射为后端 Link 实际值：

```diff
   const doc = {
-    stock_entry_type: 'material_transfer',
+    stock_entry_type: 'Material Transfer',
     from_warehouse: fromWarehouse,
     to_warehouse: toWarehouse,
```

其余（输入 schema、`material_transfer` 校验、幂等/前置/事后/批次/确认）一律不动。

## 3. 回归证据

### 3.1 开发自检（`node server/test/selftest.js`）

- **155 通过 / 4 失败**，4 个失败项均为 S01 隔离负向读取自证（`task-sets`/`assertions`/`runs`/`snapshots`），该 4 项在非受限账户环境下按设计恒 FAIL（selftest 头注：S01 需在受限账户 `b00-impl` 下运行方得 ACCESS_DENIED，以 `verify-impl.ps1` 的 `ISOLATED: all checks passed` 为隔离自证依据）。
- 其余 S02–S24（155 项）全部通过，**修复未引入回归**。

### 3.2 真实后端 #23→#24 链路自证（`mcp-service` token + `elicitation` auto-accept）

前置：以 Administrator 造专用物料 `F04FIX-ITEM` + 期初库存（Stores - G，10 单位）；`stock_entry_type:'material_transfer'`，`from=Stores - G`、`to=Finished Goods - G`、`qty=1`。结果 **11 通过 / 0 失败**：

| 断言 | 结果 |
|---|---|
| #23 create 成功（草稿 `MAT-STE-2026-00001`） | 通过 |
| 回读草稿 `purpose = Material Transfer` | 通过 |
| 回读草稿 `stock_entry_type = Material Transfer` | 通过 |
| 回读草稿 `to_warehouse = Finished Goods - G` 落库 | 通过 |
| 回读草稿 `from_warehouse = Stores - G` 落库 | 通过 |
| #24 confirm 生效 `docstatus=1` | 通过 |
| Bin 源仓减少 1（10 → 9） | 通过 |
| Bin 目标仓增加 1（0 → 1） | 通过 |
| SLE 源仓 `-1`（`voucher_type=Stock Entry`） | 通过 |
| SLE 目标仓 `+1`（`voucher_type=Stock Entry`） | 通过 |
| 写入能力判定完成（币种/价格表 fail-closed 通过） | 通过 |

- 关键证据（脱敏摘录）：SLE 两行 `{"item_code":"F04FIX-ITEM","warehouse":"Stores - G","actual_qty":-1,"voucher_type":"Stock Entry","voucher_no":"MAT-STE-2026-00001"}` 与 `{"warehouse":"Finished Goods - G","actual_qty":1,...}`；Bin 源 `actual_qty=9`、目标 `actual_qty=1`。

## 4. 验证前置环境说明（非代码改动）

- 验证前后端 mcp-service 凭据失效（`/tmp/mcp_token.txt` 与库中 api_key 不一致，快照恢复后未重放 E01），已按公开 `erp/replay-e01.py`（幂等）重放 E01 重建 token + 23 DocPerm + 账号角色（verify PASS），属 post-E01 基线重建，非定向调参/改题。
- 测试残留：`F04FIX-ITEM` + 期初库存 + 一张已生效 `MAT-STE-2026-00001`（及 Bin/SLE），以 G01 逐题快照恢复归零为准（总则/退回记录 §残留口径）。

## 5. 结论

一处实现缺陷已修复并完成真实后端 #23→#24 全链路 + selftest 回归。待 Owner 拍板后 G01 复跑 T09。
