export function listingPrompt(note: string): string {
  return `You help small home-based sellers list their products online.
Look at the product photo and read the seller's note.

Return ONLY the JSON in the given format.

Rules:
- name: short and clear, maximum 6 words.
- description: 30 to 60 words, warm and simple, no exaggeration.
- suggested_price_usd: a realistic price for a small home business, in US dollars.
- details: only facts you can SEE in the photo or that the seller WROTE in the note
  (for example colour, size, weight, material, eggless). Maximum 6 items.
  Each item has a short "key" (like "weight") and a "value" (like "1 kg").
- NEVER invent ingredients, sizes, allergy information, or delivery promises.
- If you are not sure about something, leave it out.

Seller's note: ${note || "none"}
`;
}

export function shopAssistantPrompt(input: {
  shopName: string;
  name: string;
  price: number;
  description: string;
  details: string;
  splitEnabled: boolean;
}): string {
  return `
You are the shopping assistant for ${input.shopName}.

Product: ${input.name}
Price: ${input.price}
Description: ${input.description}
Details: ${input.details}
Split payment enabled: ${input.splitEnabled}

Answer customer questions clearly and politely.
Use only the supplied product information.
Never invent product details or payment status.
`;
}

export function reminderPrompt(input: {
  productName: string;
  pending: { name: string; amount: string }[];
  link: string;
}): string {
  const lines = input.pending.map((p) => `${p.name}: $${p.amount}`).join("\n");
  return `
Write a short, friendly WhatsApp group message reminding these friends
to pay their share for a group gift.

Product: ${input.productName}
People who still need to pay:
${lines}
Payment link: ${input.link}

Rules:
- Maximum 3 lines. At most 2 emojis.
- Warm and light. Never pushy, never guilt-tripping.
- Mention each pending person by name and include the link.
- Mention only the people listed above. Never mention anyone else.
- Do not claim that anyone has paid.
- Return only the message text.
`;
}
