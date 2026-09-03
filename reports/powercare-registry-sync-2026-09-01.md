# PowerCare clients vs the client registry sheet
Read live 2026-09-01 from the CRM (75 PowerCare customers) and
"Conexsol Client List" tab `MAIN LIST ` (767 numbered rows, 674 assigned).

Sheet convention in use, from 79 existing rows: `<Name> POWERCARE: <case#>` in the Name column.

## A. Already correct: 58 rows
Name column already carries a case number that agrees with the CRM. No action.

## B. Need the case number added: 13 rows
Paste into column C of the listed row.

| Row | Number | Current Name cell | Replace with |
|-----|--------|-------------------|--------------|
| 446 | US-15459 | Michael Fitzi | `Michael Fitzi POWERCARE: 6083080` |
| 461 | US-15474 | George Rohling | `George Rohling POWERCARE: 6020784` |
| 464 | US-15477 | Liuba Medina | `Liuba Medina POWERCARE: 6200992` |
| 495 | US-15508 | Dayami Pantoja | `Dayami Pantoja POWERCARE: 6226749` |
| 506 | US-15519 | Sylvia Fox | `Sylvia Fox POWERCARE: 6083050` |
| 516 | US-15529 | Osama Abuadieh | `Osama Abuadieh POWERCARE: 6429730` |
| 537 | US-15550 | Lee Duerr | `Lee Duerr POWERCARE: 6517658` |
| 566 | US-15579 | Liliane Grand'Bois - [Enhanced Service] S440 (11) Optimizer RMA | `Liliane Grand'Bois POWERCARE: 6537090` |
| 616 | US-15629 | Elijah Hopkins | `Elijah Hopkins POWERCARE: 6871714` |
| 617 | US-15630 | Pete Zittere | `Pete Zittere POWERCARE: 6887843` |
| 629 | US-15642 | Ernesto Velazquez | `Ernesto Velazquez POWERCARE: 6866663` |
| 653 | US-15666 | Charles Bingham POWERCARE | `Charles Bingham POWERCARE: 7021729` |
| 654 | US-15667 | Todd Farley POWERCARE | `Todd Farley POWERCARE: 6995588` |

Row 566 drops the RMA description. Keep it in the DESCRIPTION column instead if it still matters.

## C. PowerCare with no case number anywhere: 2
- US-15341 row 328, Steven Mellion
- US-15613 row 600, Linda Mclaughlin
  Note: the sheet already has `Client: Linda Mclaughlin POWERCARE: 6777161` on **US-15627 row 614**.
  Same person on two numbers. Decide which one she keeps, then the other row should be freed.

## D. Blank sheet rows the CRM already gave away: 2
- US-15689 row 676 blank in sheet, CRM has **CARLOS DIAZ** (PowerCare, no case number)
- US-15690 row 677 blank in sheet, CRM has **Wilber Vega** (PowerCare, no case number)

These two are live hazards. The next "Move to Client" claims the first blank row, so it would
claim 15689, hit the CRM duplicate guard against Carlos Diaz, and merge the new lead into him.
That is exactly the Danielle Ferrari failure. The guard shipped today now blocks it with a
message instead of merging, but the sheet is still wrong.

## E. Case number disagreement: 1
- US-15433 Ariel Alfonzo, row 420. Sheet says case **6055345**, CRM says **6477709**.

## Also outstanding, from the Ferrari investigation
- The sheet now reads `Andres Jimenez` on US-15688. **Danielle Ferrari has no number and no
  customer record.** First number free in both systems is **US-15691** (15689 and 15690 are
  taken in the CRM by Diaz and Vega).
- CRM off-by-one against the sheet below 15685: 15682 sheet=Carlos Bernal / CRM=Travis
  Fullenkamp; 15683 sheet=LG ESS / CRM=nobody; 15684 holds **two** CRM customers,
  Carlos Bernal and Edward Olivares.
