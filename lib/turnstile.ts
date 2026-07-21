export async function verifyTurnstile(token: string): Promise<boolean> {
  try {
    const secret = process.env.TURNSTILE_SECRET_KEY;
    if (!secret) return true;

    const formData = new URLSearchParams();
    formData.append("secret", secret);
    formData.append("response", token);

    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}
