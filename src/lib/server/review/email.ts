export function isValidReviewEmail(email: string | null): email is string {
  return Boolean(
    email &&
    email === email.toLowerCase() &&
    /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email),
  );
}
