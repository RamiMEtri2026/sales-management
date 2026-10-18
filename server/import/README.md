# Legacy Data Import

## Status

**No legacy SQL Server schema or data export was provided.** This importer is
a framework. It has **not** been run against real data, and no reconciliation
has been performed. Do not treat any output as verified until you run it on a
disposable copy and reconcile.

## Expected input format

Create a directory (default `./import/data`) containing one CSV per table.
Column names are exact and case-sensitive. Money columns are decimal strings
in **EGP** (e.g. `1234.56`); the importer converts them to integer piasters.

### `categories.csv`
| column | required | notes |
|---|---|---|
| `legacy_id` | yes | stable id from the old system |
| `code` | yes | unique |
| `name` | yes | unique |

### `units.csv`
| column | required |
|---|---|
| `legacy_id` | yes |
| `code` | yes |
| `name` | yes |

### `customers.csv`
| column | required | notes |
|---|---|---|
| `legacy_id` | yes | |
| `code` | yes | unique |
| `name` | yes | |
| `phone` | no | |
| `address` | no | |
| `opening_balance` | yes | decimal EGP, e.g. `0.00` |

### `suppliers.csv`
Same columns as `customers.csv`.

### `products.csv`
| column | required | notes |
|---|---|---|
| `legacy_id` | yes | |
| `sku` | yes | unique |
| `barcode` | no | |
| `name` | yes | |
| `category_legacy_id` | yes | must resolve to a row in `categories.csv` |
| `unit_legacy_id` | yes | must resolve to a row in `units.csv` |
| `cost_price` | yes | decimal EGP |
| `sale_price` | yes | decimal EGP |
| `reorder_level` | no | integer |

## Run
