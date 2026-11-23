import { randomBytes } from 'node:crypto';

/** Result of a (simulated) card charge. Real card data never reaches this API; only gateway tokens do. */
export type GatewayResult = { ok: true; reference: string } | { ok: false; reason: string };

/**
 * Local stand-in for a payment gateway. Tokens look like `tok_<id>`; `tok_declined` always fails.
 * Swap this for a real gateway client without touching the order logic.
 */
export const simulatedGateway = {
  charge(token: string, _amount: number): GatewayResult {
    if (token === 'tok_declined') return { ok: false, reason: 'Your card was declined.' };
    if (!/^tok_[A-Za-z0-9_]{4,}$/.test(token)) return { ok: false, reason: 'The payment could not be processed.' };
    return { ok: true, reference: `ch_${randomBytes(9).toString('hex')}` };
  },
};

export type Gateway = typeof simulatedGateway;
