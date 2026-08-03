import { normalizePhone } from "./utils";

export function normalizeJundiaiMobile(value: string) {
  let phone = normalizePhone(value);
  if (phone.length === 11) phone = `55${phone}`;
  return /^55119\d{8}$/.test(phone) ? phone : null;
}
