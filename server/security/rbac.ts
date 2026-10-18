/**
 * Server-side permission enforcement.
 *
 * Permissions are stored in the `permissions` table and granted to roles via
 * `role_permissions`. `requirePermission` is applied to every protected route;
 * hiding a button in the UI is never sufficient.
 *
 * Permission codes follow the pattern `<module>.<action>`:
 *   view, create, edit, deactivate, finalize, cancel, approve, print, export,
 *   view_cost, view_salary, manage_users, manage_roles, manage_settings.
 */

import type { Response, NextFunction } from "express";
import type Database from "better-sqlite3";
import type { AuthedRequest } from "../routes.secure.js";

export type PermissionCode =
  | "customers.view" | "customers.create" | "customers.edit" | "customers.deactivate"
  | "suppliers.view" | "suppliers.create" | "suppliers.edit" | "suppliers.deactivate"
  | "products.view" | "products.create" | "products.edit" | "products.deactivate" | "products.view_cost"
  | "inventory.view" | "inventory.adjust" | "inventory.approve_adjustment" | "inventory.transfer"
  | "sales.view" | "sales.create" | "sales.finalize" | "sales.cancel" | "sales.return" | "sales.print"
  | "purchases.view" | "purchases.create" | "purchases.finalize" | "purchases.cancel" | "purchases.return"
  | "cash.view" | "cash.create" | "cash.reverse"
  | "expenses.view" | "expenses.create" | "expenses.reverse"
  | "employees.view" | "employees.create" | "employees.edit" | "employees.deactivate" | "employees.view_salary"
  | "payroll.view" | "payroll.create" | "payroll.approve" | "payroll.reverse"
  | "taxes.view" | "taxes.manage"
  | "reports.view" | "reports.export" | "reports.print"
  | "settings.view" | "settings.manage"
  | "users.manage" | "roles.manage"
  | "audit.view";

export function userPermissions(db: Database.Database, userId: string): Set<string> {
  const rows = db
    .prepare(
      `SELECT rp.permission_code AS code
       FROM user_roles ur
       JOIN role_permissions rp ON rp.role_id = ur.role_id
       WHERE ur.user_id = ?`,
    )
    .all(userId) as { code: string }[];
  return new Set(rows.map((r) => r.code));
}

export function hasPermission(db: Database.Database, userId: string, code: PermissionCode): boolean {
  return userPermissions(db, userId).has(code);
}

export function requirePermission(code: PermissionCode) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ code: "UNAUTHENTICATED", message: "يجب تسجيل الدخول." });
      return;
    }
    const db = req.app.locals.db as Database.Database;
    if (!hasPermission(db, req.user.id, code)) {
      res.status(403).json({ code: "FORBIDDEN", message: "ليس لديك صلاحية لتنفيذ هذه العملية." });
      return;
    }
    next();
  };
}

/**
 * Seeds the permission catalog and the three built-in roles.
 * Idempotent: safe to run on every startup.
 * Does NOT create any user — see provision.ts.
 */
export function seedRbac(db: Database.Database): void {
  const permissions: [string, string][] = [
    ["customers.view", "عرض العملاء"], ["customers.create", "إضافة عميل"],
    ["customers.edit", "تعديل عميل"], ["customers.deactivate", "تعطيل عميل"],
    ["suppliers.view", "عرض الموردين"], ["suppliers.create", "إضافة مورد"],
    ["suppliers.edit", "تعديل مورد"], ["suppliers.deactivate", "تعطيل مورد"],
    ["products.view", "عرض المنتجات"], ["products.create", "إضافة منتج"],
    ["products.edit", "تعديل منتج"], ["products.deactivate", "تعطيل منتج"],
    ["products.view_cost", "عرض تكلفة المنتج"],
    ["inventory.view", "عرض المخزون"], ["inventory.adjust", "تسوية المخزون"],
    ["inventory.approve_adjustment", "اعتماد تسوية المخزون"], ["inventory.transfer", "تحويل مخزون"],
    ["sales.view", "عرض فواتير البيع"], ["sales.create", "إنشاء فاتورة بيع"],
    ["sales.finalize", "اعتماد فاتورة بيع"], ["sales.cancel", "إلغاء فاتورة بيع"],
    ["sales.return", "مرتجع بيع"], ["sales.print", "طباعة فاتورة بيع"],
    ["purchases.view", "عرض فواتير الشراء"], ["purchases.create", "إنشاء فاتورة شراء"],
    ["purchases.finalize", "اعتماد فاتورة شراء"], ["purchases.cancel", "إلغاء فاتورة شراء"],
    ["purchases.return", "مرتجع شراء"],
    ["cash.view", "عرض الحركات النقدية"], ["cash.create", "إضافة حركة نقدية"], ["cash.reverse", "عكس حركة نقدية"],
    ["expenses.view", "عرض المصروفات"], ["expenses.create", "إضافة مصروف"], ["expenses.reverse", "عكس مصروف"],
    ["employees.view", "عرض الموظفين"], ["employees.create", "إضافة موظف"],
    ["employees.edit", "تعديل موظف"], ["employees.deactivate", "تعطيل موظف"],
    ["employees.view_salary", "عرض رواتب الموظفين"],
    ["payroll.view", "عرض الرواتب"], ["payroll.create", "إنشاء سجل راتب"],
    ["payroll.approve", "اعتماد صرف راتب"], ["payroll.reverse", "عكس صرف راتب"],
    ["taxes.view", "عرض الضرائب"], ["taxes.manage", "إدارة الضرائب"],
    ["reports.view", "عرض التقارير"], ["reports.export", "تصدير التقارير"], ["reports.print", "طباعة التقارير"],
    ["settings.view", "عرض الإعدادات"], ["settings.manage", "إدارة الإعدادات"],
    ["users.manage", "إدارة المستخدمين"], ["roles.manage", "إدارة الأدوار"],
    ["audit.view", "عرض سجل التدقيق"],
  ];

  const insertPerm = db.prepare("INSERT OR IGNORE INTO permissions (code, description) VALUES (?, ?)");
  const tx = db.transaction(() => {
    for (const [code, desc] of permissions) insertPerm.run(code, desc);
  });
  tx();

  const roles: { code: string; name: string; perms: string[] }[] = [
    {
      code: "admin",
      name: "مدير النظام",
      perms: permissions.map(([c]) => c),
    },
    {
      code: "manager",
      name: "مدير",
      perms: permissions
        .map(([c]) => c)
        .filter((c) => !["users.manage", "roles.manage", "settings.manage"].includes(c)),
    },
    {
      code: "sales",
      name: "مبيعات",
      perms: [
        "customers.view", "customers.create", "customers.edit",
        "products.view", "inventory.view",
        "sales.view", "sales.create", "sales.finalize", "sales.print",
        "cash.view", "cash.create",
        "reports.view",
      ],
    },
    {
      code: "accountant",
      name: "محاسب",
      perms: [
        "customers.view", "suppliers.view", "products.view", "products.view_cost",
        "inventory.view", "sales.view", "purchases.view",
        "cash.view", "cash.create", "cash.reverse",
        "expenses.view", "expenses.create", "expenses.reverse",
        "employees.view", "employees.view_salary", "payroll.view", "payroll.approve",
        "taxes.view", "reports.view", "reports.export", "reports.print",
        "settings.view", "audit.view",
      ],
    },
  ];

  const insertRole = db.prepare(
    "INSERT INTO roles (id, code, name, is_system, created_at) VALUES (?, ?, ?, 1, ?) ON CONFLICT(code) DO NOTHING",
  );
  const findRole = db.prepare("SELECT id FROM roles WHERE code = ?");
  const insertRolePerm = db.prepare(
    "INSERT OR IGNORE INTO role_permissions (role_id, permission_code) VALUES (?, ?)",
  );

  const tx2 = db.transaction(() => {
    for (const r of roles) {
      insertRole.run(r.code, r.code, r.name, new Date().toISOString());
      const role = findRole.get(r.code) as { id: string } | undefined;
      if (!role) continue;
      for (const p of r.perms) insertRolePerm.run(role.id, p);
    }
  });
  tx2();
}