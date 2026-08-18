import { RoleName } from '@prisma/client';

/**
 * The full permission catalogue. Every permission an API route can
 * require must be declared here. "*" on OWNER means "matches anything".
 *
 * This mirrors section 11 of the handbook:
 *   OWNER: *
 *   PRODUCT_MANAGER: products.*, inventory.view, inventory.receive
 *   CASHIER: sales.create, sales.view_own, payments.create, receipts.print
 */
export const ROLE_PERMISSIONS: Record<RoleName, string[]> = {
  OWNER: ['*'],

  PRODUCT_MANAGER: [
    'products.create',
    'products.update',
    'products.view',
    'categories.create',
    'brands.create',
    'inventory.view',
    'inventory.receive',
    'inventory.adjust', // "if permitted" per spec — owner can revoke by editing this list per-deployment
    'suppliers.view',
    'suppliers.create',
    'purchases.create',
    'purchases.view',
  ],

  CASHIER: [
    'sales.create',
    'sales.view_own',
    'payments.create',
    'receipts.print',
    'receipts.reprint',
    'customers.create',
    'customers.view',
    'products.view', // needs to search/scan products, not edit them
    'inventory.view', // read-only, to see stock while selling
    'register.open',
    'register.close',
  ],
};

/** Returns true if the given role is allowed to perform `permission`. */
export function roleHasPermission(role: RoleName, permission: string): boolean {
  const granted = ROLE_PERMISSIONS[role] ?? [];
  if (granted.includes('*')) return true;
  if (granted.includes(permission)) return true;
  // support simple wildcard suffixes like "products.*"
  return granted.some((p) => p.endsWith('.*') && permission.startsWith(p.slice(0, -1)));
}
