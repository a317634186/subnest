export interface SupplierProduct {
  id: string; name: string; description?: string; price: number; publicPrice?: number;
  imageUrl?: string; delivery?: { type: string }; sold?: number; inStock?: boolean;
  stock?: number | null; requiresEmailActivation?: boolean;
  inputKind?: '' | 'pixel' | 'sheerid'; initiallyEnabled?: boolean;
}
export type ServiceInput = {kind:'pixel';gmail:string;password:string;totp:string;backupCodes:string[]} | {kind:'sheerid';link:string};
export interface SupplierOrder {
  orderId: string; status: string; product?: { id: string; name: string };
  quantity?: number; amount?: number; deliveredKey?: string; deliveredKeys?: string[];
  activationInstructions?: unknown[]; activation?: { emails?: string[]; eta?: string }; createdAt?: string;
  subjectHash?: string;
}
export interface Supplier {
  readonly supportsIdempotency?: boolean;
  readonly maxQuantity?: number;
  readonly noChargeOnHttpError?: readonly number[];
  products(): Promise<SupplierProduct[]>;
  product(id: string): Promise<SupplierProduct>;
  balance(): Promise<{ balance: number; membership: string }>;
  purchase(input: { productId: string; quantity: number; email?: string; emails?: string[]; serviceInput?: ServiceInput }, key: string): Promise<SupplierOrder>;
  order(id: string): Promise<SupplierOrder>;
  orders(page?: number): Promise<unknown>;
}
export class AppError extends Error {
  constructor(public status: number, message: string, public code = 'REQUEST_FAILED') { super(message); }
}
