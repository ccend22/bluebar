# BlueBar
## Product
A bar/restaurant operations tool for waiters and managers. Albanian interface. User requires inventory, waiter management, tables, products and categories, 80mm receipts, shifts, manager invoice management and secure IP-restricted waiter login.
## Platform
Web, desktop and mobile.
## Stack
React frontend, Neon PostgreSQL database. No animations or heavy libraries.
## Experience
Fast, simple operational UI. Tables first, large touch targets, readable amounts, explicit states. No marketing imagery.
## Assumptions for prototype
One venue; Albanian Lek; server-authoritative data stored in Neon PostgreSQL through a local Fastify API. Sign-in is implemented (waiter PIN limited to the venue IP allowlist, manager PIN, both 6-digit); fiscalization and silent printer integration are not. Historical browser demo data is preserved but not imported. Printer model, venue public IP, fiscal jurisdiction, deployment and offline requirements remain unanswered.
