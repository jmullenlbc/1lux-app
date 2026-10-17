import { prisma } from '@/lib/db';

/**
 * The next human-readable contact number.
 *
 * People can be created from two places, the CRM contacts screen and a client's
 * People tab, and before the two people tables were merged only the first one
 * ever handed out a number. Both call this now, so the numbers stay one running
 * sequence instead of two overlapping ones.
 *
 * Same max+1 approach the client and project numbers use.
 */
export async function nextContactNumber() {
  const max = await prisma.contact.aggregate({ _max: { contactNumber: true } });
  return (max._max.contactNumber ?? 0) + 1;
}
