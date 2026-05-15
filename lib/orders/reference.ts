import { customAlphabet } from 'nanoid';

// Order references look like ORD-A4F2-9K — short and readable. The
// alphabet excludes 0/O/1/I/L to avoid the classic "is that a zero or
// the letter O" reading mistake when buyers and sellers type a reference
// to each other over chat or paper. ~31^6 = 887 million possibilities,
// collision-impossible at this platform's scale; the orders.reference
// UNIQUE constraint is the absolute backstop.
const REF_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const segment = customAlphabet(REF_ALPHABET, 4);
const tail = customAlphabet(REF_ALPHABET, 2);

export function generateOrderReference(): string {
  return `ORD-${segment()}-${tail()}`;
}
