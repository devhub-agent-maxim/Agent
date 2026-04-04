import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding demo tenant...");

  // -- Tenant --
  const tenant = await prisma.tenant.upsert({
    where: { slug: "acme-demo" },
    update: {},
    create: {
      clerkOrgId: "org_demo_acme_000",
      name: "Acme Corp (Demo)",
      slug: "acme-demo",
      plan: "retainer_500",
    },
  });

  const tid = tenant.id;

  // -- GL Codes --
  const glCodes = await Promise.all(
    [
      { code: "5010", description: "Office Supplies", category: "expense" },
      { code: "5020", description: "Software & SaaS", category: "expense" },
      { code: "5030", description: "Professional Services", category: "expense" },
      { code: "5040", description: "Travel & Entertainment", category: "expense" },
      { code: "2010", description: "Accounts Payable", category: "liability" },
    ].map((gl) =>
      prisma.glCode.upsert({
        where: { tenantId_code: { tenantId: tid, code: gl.code } },
        update: {},
        create: { tenantId: tid, ...gl },
      })
    )
  );

  // -- Vendors --
  const staples = await prisma.vendor.upsert({
    where: { tenantId_code: { tenantId: tid, code: "V-001" } },
    update: {},
    create: {
      tenantId: tid,
      name: "Staples Inc.",
      code: "V-001",
      email: "billing@staples.example.com",
      paymentTerms: 30,
      address: { street: "500 Staples Dr", city: "Framingham", state: "MA", zip: "01702", country: "US" },
    },
  });

  const aws = await prisma.vendor.upsert({
    where: { tenantId_code: { tenantId: tid, code: "V-002" } },
    update: {},
    create: {
      tenantId: tid,
      name: "Amazon Web Services",
      code: "V-002",
      email: "aws-billing@amazon.example.com",
      paymentTerms: 30,
    },
  });

  // -- Purchase Order --
  const po = await prisma.purchaseOrder.upsert({
    where: { tenantId_poNumber: { tenantId: tid, poNumber: "PO-2026-001" } },
    update: {},
    create: {
      tenantId: tid,
      vendorId: staples.id,
      poNumber: "PO-2026-001",
      totalAmount: new Prisma.Decimal("2500.00"),
      status: "open",
    },
  });

  // -- Invoice with line items --
  const inv = await prisma.invoice.upsert({
    where: { tenantId_invoiceNumber: { tenantId: tid, invoiceNumber: "INV-8001" } },
    update: {},
    create: {
      tenantId: tid,
      vendorId: staples.id,
      purchaseOrderId: po.id,
      invoiceNumber: "INV-8001",
      status: "pending",
      totalAmount: new Prisma.Decimal("1250.00"),
      taxAmount: new Prisma.Decimal("100.00"),
      dueDate: new Date("2026-05-01"),
      ocrConfidence: 0.94,
    },
  });

  // Line items (delete + recreate for idempotency)
  await prisma.lineItem.deleteMany({ where: { invoiceId: inv.id } });
  await prisma.lineItem.createMany({
    data: [
      {
        tenantId: tid,
        invoiceId: inv.id,
        glCodeId: glCodes[0].id, // Office Supplies
        description: "A4 Paper (10 boxes)",
        quantity: new Prisma.Decimal("10"),
        unitPrice: new Prisma.Decimal("45.00"),
        amount: new Prisma.Decimal("450.00"),
        sortOrder: 1,
      },
      {
        tenantId: tid,
        invoiceId: inv.id,
        glCodeId: glCodes[0].id,
        description: "Toner Cartridges",
        quantity: new Prisma.Decimal("4"),
        unitPrice: new Prisma.Decimal("200.00"),
        amount: new Prisma.Decimal("800.00"),
        sortOrder: 2,
      },
    ],
  });

  // -- Approval Rules --
  await prisma.approvalRule.deleteMany({ where: { tenantId: tid } });
  await prisma.approvalRule.createMany({
    data: [
      {
        tenantId: tid,
        name: "Auto-approve small invoices",
        minAmount: new Prisma.Decimal("0"),
        maxAmount: new Prisma.Decimal("500.00"),
        approverEmail: "system@acme.example.com",
        approverRole: "ap_clerk",
        autoApprove: true,
        priority: 0,
      },
      {
        tenantId: tid,
        name: "Manager approval",
        minAmount: new Prisma.Decimal("500.01"),
        maxAmount: new Prisma.Decimal("5000.00"),
        approverEmail: "controller@acme.example.com",
        approverRole: "manager",
        priority: 1,
      },
      {
        tenantId: tid,
        name: "CFO approval for large invoices",
        minAmount: new Prisma.Decimal("5000.01"),
        approverEmail: "cfo@acme.example.com",
        approverRole: "cfo",
        priority: 2,
      },
    ],
  });

  // -- Audit Log entry --
  await prisma.auditLog.create({
    data: {
      tenantId: tid,
      entityType: "tenant",
      entityId: tid,
      action: "created",
      actorEmail: "seed@system",
      changes: { note: "Demo tenant seeded" },
    },
  });

  console.log(`Seeded tenant "${tenant.name}" (${tid})`);
  console.log(`  - ${glCodes.length} GL codes`);
  console.log(`  - 2 vendors, 1 PO, 1 invoice with 2 line items`);
  console.log(`  - 3 approval rules, 1 audit log entry`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
