# NetSuite writes: specification (not active)

Status: **documentation only.** Decision 2026-11-12: the program does not write to NetSuite until the rest of it is vetted. Today it only reads the CLIQ catalog (items, cost, stock, price levels) for subsidiary 11, SHIFT Innovations.

Every write below goes through the ERP's staging queue: **submitted → in review → pushed → confirmed**, or **rejected** with a reason that returns to the ERP record. Nothing is pushed without a person in the owning team approving it. Each record keeps the NetSuite internal ID returned on push and syncs status back.

Field names below come from Brian's CLIQ AI Quote Tool, which writes these records today, and from the SHIFT NetSuite account. Confirm each against the account before building.

## 1. New CLIQ item (item request)
- **Trigger:** a layout needs a part number that isn't in the NetSuite catalog (the engine flags "isn't set up in NetSuite").
- **Owner / reviewer:** purchasing.
- **Record:** inventory item, subsidiary 11. Item ID = the CLIQ part number; description from the engine; preferred vendor Tach Lighting & Electronics (to confirm); price levels from the DN sheet.
- **Back to the ERP:** item internal ID; the quote line links to it.

## 2. Customer (when new)
- **Trigger:** quote for a customer with no NetSuite ID.
- **Owner / reviewer:** inside team.
- **Record:** customer with the full profile entered in the ERP (billing and shipping addresses, terms, credit limit, tax exemption, contacts).
- **After push:** NetSuite wins on billing, shipping, terms, credit and tax. An ERP change to those fields becomes a proposed change in the queue, the inside team is notified (Teams/email), and the push happens only once agreed.

## 3. Estimate (copy of the ERP quote)
- **Trigger:** quote issued from the ERP.
- **Owner:** sales. Read-only copy in NetSuite; the ERP quote is the master.
- **Record:** estimate, form 315 "SFT_Quote Line" (316 "SFT_Quote Lot" for lot quotes); customer; opportunity (created first if missing, form 334); entity status; sales rep / rep agency; project manager; terms; freight terms; expected close date; memo = project name; lines = item, qty, rate, lead time text.
- **On change:** a revised quote updates the estimate (new revision), never a second estimate.

## 4. Sales order
- **Trigger:** quote won with a customer PO.
- **Owner / reviewer:** inside team confirms before push.
- **Record:** transform estimate → sales order. Form 319 "SFT_Sales Order Lot" (337 "SFT_Ship Schedule"); `otherRefNum` = customer PO ("SAMPLE - NO PO" for samples); order date; `custbody_so_requested_onsite_date`; location 77, department 9, class 1 (current defaults; confirm); ship-to = the job site set on the ERP order; memo = project name.
- **Checks before push:** customer PO read and compared with the quote (lines, prices, ship-to); every line has a NetSuite item and a price above $0.
- **After push:** NetSuite owns fulfillment and billing status. Changes are ERP change orders through the queue.

## 5. Purchase request to the contract manufacturer
- **Trigger:** sales order lines short on stock (on hand + on order below demand), or a build-to-stock decision.
- **Owner:** purchasing finalizes the PO in NetSuite, always.
- **Record staged in the ERP:** vendor (Tach), items, quantities, need-by date, linked sales order lines. Purchasing creates the PO in NetSuite; the ERP reads PO number, status, receipts and ship dates back.

## 6. Not written by the ERP
- Inventory, item fulfillments, receipts, assembly builds, invoices and payments: NetSuite only. The ERP shows them (minutes behind is acceptable).
- Shipment tracking: NetSuite fulfillment records plus a carrier tracking feed into the ERP.

## Open
- Kits (CLIQ Sample Case) and enclosure conversions: NetSuite kit items vs assembly items and builds.
- Rep commission lines on SOs (Specification / Distributor Sales / Destination): how the ERP computes them.
- Whether Brian's tool keeps writing estimates and SOs directly until the ERP replaces it.
