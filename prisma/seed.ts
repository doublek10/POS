import { PrismaClient, RoleName } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { ROLE_PERMISSIONS } from '../lib/permissions/catalogue';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding roles & permissions…');

  // Collect every distinct permission string used across all roles
  // (excluding the wildcard) so we have Permission rows to link.
  const allPermissionCodes = Array.from(
    new Set(
      Object.values(ROLE_PERMISSIONS)
        .flat()
        .filter((code) => code !== '*' && !code.endsWith('.*'))
    )
  );

  for (const code of allPermissionCodes) {
    await prisma.permission.upsert({
      where: { code },
      update: {},
      create: { code, label: code.replace(/[._]/g, ' ') },
    });
  }
  // The wildcard itself, so OWNER's role_permissions join table has a row too.
  await prisma.permission.upsert({
    where: { code: '*' },
    update: {},
    create: { code: '*', label: 'All permissions' },
  });

  const roles: RoleName[] = ['OWNER', 'PRODUCT_MANAGER', 'CASHIER'];
  for (const name of roles) {
    const role = await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name },
    });

    const codes = ROLE_PERMISSIONS[name].filter((c) => !c.endsWith('.*') || c === '*');
    // For wildcard-suffixed entries like "products.*", just also grant
    // the wildcard permission row in the join table for visibility in
    // /api/audit-logs and admin UIs — actual enforcement happens in
    // lib/permissions/catalogue.ts's roleHasPermission(), not this table.
    for (const code of [...ROLE_PERMISSIONS[name]]) {
      const permCode = code.endsWith('.*') ? code : code;
      const permission = await prisma.permission.upsert({
        where: { code: permCode },
        update: {},
        create: { code: permCode, label: permCode },
      });
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }

  console.log('Seeding demo company…');

  const company = await prisma.company.upsert({
    where: { id: 'demo-company' },
    update: {},
    create: {
      id: 'demo-company',
      name: 'ABC Supermarket',
      phone: '0712000000',
      address: 'Nairobi, Kenya',
      country: 'KE',
      currency: 'KES',
    },
  });

  const branch = await prisma.branch.upsert({
    where: { id: 'demo-branch' },
    update: {},
    create: { id: 'demo-branch', companyId: company.id, name: 'Main Branch' },
  });

  await prisma.cashRegister.upsert({
    where: { id: 'demo-register' },
    update: {},
    create: { id: 'demo-register', branchId: branch.id, name: 'Till 01' },
  });

  const ownerRole = await prisma.role.findUniqueOrThrow({ where: { name: 'OWNER' } });
  const pmRole = await prisma.role.findUniqueOrThrow({ where: { name: 'PRODUCT_MANAGER' } });
  const cashierRole = await prisma.role.findUniqueOrThrow({ where: { name: 'CASHIER' } });

  const demoUsers = [
    { email: 'owner@demo.com', name: 'Jane Owner', role: ownerRole },
    { email: 'manager@demo.com', name: 'Peter Manager', role: pmRole },
    { email: 'cashier@demo.com', name: 'John Kamau', role: cashierRole },
  ];

  const passwordHash = await bcrypt.hash('password123', 12);

  for (const u of demoUsers) {
    await prisma.user.upsert({
      where: { companyId_email: { companyId: company.id, email: u.email } },
      update: {},
      create: {
        companyId: company.id,
        name: u.name,
        email: u.email,
        passwordHash,
        roleId: u.role.id,
      },
    });
  }

  console.log('Seeding a couple of demo products…');

  const category = await prisma.category.upsert({
    where: { companyId_name: { companyId: company.id, name: 'Groceries' } },
    update: {},
    create: { companyId: company.id, name: 'Groceries' },
  });

  const demoProducts = [
    { name: 'Milk 500ml', sku: 'DRINK-001', costPrice: 60, sellingPrice: 100, barcode: '5449000000996' },
    { name: 'Bread', sku: 'BAKE-001', costPrice: 60, sellingPrice: 80, barcode: '5449000096001' },
    { name: 'Sugar 1KG', sku: 'GROC-001', costPrice: 110, sellingPrice: 150, barcode: '5449000012001' },
  ];

  for (const p of demoProducts) {
    const product = await prisma.product.upsert({
      where: { companyId_sku: { companyId: company.id, sku: p.sku } },
      update: {},
      create: {
        companyId: company.id,
        categoryId: category.id,
        name: p.name,
        sku: p.sku,
        costPrice: p.costPrice,
        sellingPrice: p.sellingPrice,
        taxRate: 16,
        reorderLevel: 10,
        barcodes: { create: [{ barcode: p.barcode }] },
      },
    });

    await prisma.inventory.upsert({
      where: { productId_branchId: { productId: product.id, branchId: branch.id } },
      update: {},
      create: { productId: product.id, branchId: branch.id, quantity: 100 },
    });
  }

  console.log('Done. Demo logins (password: password123):');
  console.log('  owner@demo.com      (OWNER)');
  console.log('  manager@demo.com    (PRODUCT_MANAGER)');
  console.log('  cashier@demo.com    (CASHIER)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
