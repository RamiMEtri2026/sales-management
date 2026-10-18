/**
 * Request validation helpers.
 *
 * - Rejects unknown fields (prevents mass assignment of privileged columns).
 * - Coerces and bounds numeric inputs.
 * - Never accepts arbitrary SQL or filesystem paths from clients.
 */

import type { Request, Response, NextFunction } from "express";

export class ValidationError extends Error {
  code = "INVALID_INPUT";
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export interface FieldSpec {
  type: "string" | "int" | "money" | "date" | "enum" | "bool";
  required?: boolean;
  min?: number;
  max?: number;
  maxLength?: number;
  values?: readonly string[];
}

export type Schema = Record<string, FieldSpec>;

export function validateBody(schema: Schema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const allowed = new Set(Object.keys(schema));
      for (const k of Object.keys(body)) {
        if (!allowed.has(k)) {
          throw new ValidationError(`حقل غير مسموح به: ${k}`);
        }
      }
      const out: Record<string, unknown> = {};
      for (const [field, spec] of Object.entries(schema)) {
        const raw = body[field];
        if (raw === undefined || raw === null || raw === "") {
          if (spec.required) throw new ValidationError(`الحقل ${field} مطلوب.`);
          continue;
        }
        out[field] = coerce(field, raw, spec);
      }
      req.body = out;
      next();
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(400).json({ code: err.code, message: err.message });
        return;
      }
      res.status(400).json({ code: "INVALID_INPUT", message: "بيانات الطلب غير صالحة." });
    }
  };
}

function coerce(field: string, raw: unknown, spec: FieldSpec): unknown {
  switch (spec.type) {
    case "string": {
      if (typeof raw !== "string") throw new ValidationError(`الحقل ${field} يجب أن يكون نصًا.`);
      const v = raw.trim();
      if (spec.maxLength && v.length > spec.maxLength) throw new ValidationError(`الحقل ${field} طويل جدًا.`);
      return v;
    }
    case "int": {
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isInteger(n)) throw new ValidationError(`الحقل ${field} يجب أن يكون عددًا صحيحًا.`);
      if (spec.min !== undefined && n < spec.min) throw new ValidationError(`الحقل ${field} أصغر من الحد المسموح.`);
      if (spec.max !== undefined && n > spec.max) throw new ValidationError(`الحقل ${field} أكبر من الحد المسموح.`);
      return n;
    }
    case "money": {
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isInteger(n)) throw new ValidationError(`الحقل ${field} يجب أن يكون عددًا صحيحًا (بالبقروش).`);
      if (spec.min !== undefined && n < spec.min) throw new ValidationError(`الحقل ${field} أصغر من الحد المسموح.`);
      if (spec.max !== undefined && n > spec.max) throw new ValidationError(`الحقل ${field} أكبر من الحد المسموح.`);
      return n;
    }
    case "date": {
      if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        throw new ValidationError(`الحقل ${field} يجب أن يكون تاريخًا بصيغة YYYY-MM-DD.`);
      }
      return raw;
    }
    case "enum": {
      if (typeof raw !== "string" || !spec.values?.includes(raw)) {
        throw new ValidationError(`قيمة الحقل ${field} غير مسموح بها.`);
      }
      return raw;
    }
    case "bool": {
      if (typeof raw !== "boolean") throw new ValidationError(`الحقل ${field} يجب أن يكون قيمة منطقية.`);
      return raw;
    }
  }
}