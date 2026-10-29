# Sprint 4: Inventario, proveedores y detalle

## Analysis before implementation
- React 18 / Vite / React Router. App defines protected routes; Home owns the sidebar, header and module selection.
- Users uses AccountUI (Modal, Notice, Status), accounts.css and the shared API helper. Settings and Profile use the same authentication, layout and API service. Dashboard already had inventory navigation placeholders and no real inventory metrics.
- LanguageContext is the existing translation provider (previously es/en). Sprint dictionaries are imported by that same provider; no second context or translation engine was introduced. Existing screens retain their prior Spanish fallback when French is selected.
- Express currently mounts health, auth, usuarios, perfil and configuracion. No product, supplier or movement endpoints exist. No backend, Prisma schema, migration, database or environment file was changed.

## Delivered
- Protected routes /inventario, /proveedores and /inventario/:id, integrated into the existing sidebar and section search. The dashboard New product shortcut opens /inventario#nuevo.
- Product table, code/description search, category/inventory type/status filters, empty states, pagination (10 rows), form validation and prepared view/edit/deactivate actions.
- Product form: code, description, category, inventory type, unit, minimum stock, unit cost, status. Available stock cannot be edited. Pending catalogs use proposed text values and explicitly disclose their integration status.
- Dynamic supplier form: person (first/last name required), sole proprietor (business name required, registered name optional), company (trade name required, legal name optional). Fields remain separate; changing type clears incompatible draft fields. No company suffix is added.
- Supplier search covers every name field; sorting uses the primary name with localeCompare for the selected language. Names precede surnames.
- Product details reserve all requested attributes and a related movements section. Unconnected identifiers show an unavailable message and em dashes, with no fabricated stock or movements.
- New module text is translated in es/en/fr using LanguageContext. The language selector in either catalog persists the choice in the existing browser preference.
- Responsive layout uses existing institutional styles and Lucide icons; added filter/detail breakpoints at 1100 and 560px.

## Backend integration pending
catalogService.js is an explicit disconnected adapter: lists are empty, details return null, and no HTTP request or persistence occurs. This is not an empty response from a live inventory backend. Forms only validate and never claim to save. Deactivation is disabled until a real mutation contract exists.

Before enabling persistence, agree authenticated endpoint contracts and authorization with the backend team. Then replace the disconnected adapter and add loading/error/retry states for real requests and mutation handlers. Do not infer endpoint paths from UI route names.

UI product fields: id, code, description, category, inventoryType, unit, minimum, cost, active; stock is read-only and must come from the inventory movement calculation.
UI supplier fields: id, type (person/sole/company), firstName, lastName, businessName, socialName, tradeName, legalName, active. Map these deliberately to the future backend model. Resolve catalog identifiers, duplicate codes, cost precision/currency and server-side validation before enabling saves.
Existing authenticated API helpers and middleware can be reused; the current account endpoints cannot store products or suppliers.

## Verification
- npm run build --prefix frontend: passes.
- npm run test:sprint4 --prefix frontend: 2 tests pass (model rules and DOM integration).
- DOM integration covers protected navigation, all supplier types, optional company fields, validation feedback, three languages, unavailable product details and rendering Home/Users/Profile/Settings with mocked account responses. Test fixtures are confined to tests. No PostgreSQL connection or write occurs.
- git diff --check: passes.
- Existing npm test suites were inspected but intentionally not run: they use real PostgreSQL and write accounts/profile data; successful auth also updates last access. This respects the request not to modify the database.
- Visual browser QA on desktop/tablet/mobile remains pending. CSS breakpoints and DOM checks are not a substitute for visual QA. Existing screens have a render smoke check, not a complete backend regression run.

## Run and review
1. With the existing backend environment configured: npm run dev --prefix backend.
2. Start frontend: npm run dev --prefix frontend.
3. Sign in with an existing authorized account; visit /inventario and /proveedores or use the sidebar.
4. Open New product: validate required fields and nonnegative costs/quantities. No stock input is present and validation does not save.
5. Open New supplier: switch among all three types, check name order and optional secondary company names. Validate with only the main company name.
6. Change es/en/fr using the catalog language selector; visit /inventario/unconnected to check translated details and unavailable state.
7. Review widths 1440, 768 and 390px, modal scrolling, table horizontal scrolling, keyboard focus and the existing profile/account routes.
8. Test ordering/search/pagination with backend records after integration; currently there are intentionally no connected records.

Suggested commit: feat(frontend): add sprint 4 inventory supplier and product detail interfaces
