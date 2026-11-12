"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { friendlyError } from "@/lib/errors";
import { splitCents, toCents, centsToUsd } from "@/lib/money";

type Product = {
  id: string;
  name: string;
  description: string;
  price: number | string;
  image_url: string;
  details: Record<string, string> | null;
};
type Msg = { role: "user" | "assistant"; content: string };

const WELCOME: Msg = {
  role: "assistant",
  content: "Hi! \uD83D\uDC4B Ask me anything about this product.",
};

function Spinner() {
  return (
    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
  );
}

// Trim, swap "Me" for the buyer's own name (if given), drop empties and duplicates
function cleanNames(raw: unknown[], myName: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    let n = String(item ?? "").trim();
    if (!n) continue;
    if (myName && n.toLowerCase() === "me") n = myName;
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}

function ProductPageInner() {
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  const [messages, setMessages] = useState<Msg[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmCheckout, setConfirmCheckout] = useState(false);
  const [paying, setPaying] = useState(false);
  const [buyerName, setBuyerName] = useState("");
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null); const payLock = useRef(false);

  // Split (Phase 2)
  const [splitNames, setSplitNames] = useState<string[] | null>(null);
  const [splitting, setSplitting] = useState(false);
  const [showSplitForm, setShowSplitForm] = useState(false);
  const [splitInput, setSplitInput] = useState("");
  const [splitFormError, setSplitFormError] = useState("");
  const splitLock = useRef(false);
  const [splitEnabled, setSplitEnabled] = useState(false);

  // Show the Split button only when SPLIT_ENABLED=true on the server
  useEffect(() => {
    fetch("/api/config", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => setSplitEnabled(Boolean(c?.splitEnabled)))
      .catch(() => setSplitEnabled(false));
  }, []);

  useEffect(() => {
    fetch("/api/products", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error("load failed");
        return r.json();
      })
      .then((list: Product[]) => {
        const found = list.find((p) => p.id === id) ?? null;
        setProduct(found);
        setState(found ? "ready" : "missing");
      })
      .catch(() => setState("missing"));
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, sending, confirmCheckout, splitNames]);

  // If the buyer presses Back from PayPal or the tracker, make the buttons usable again
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        setPaying(false); payLock.current = false;
        setSplitting(false); splitLock.current = false;
      }
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  async function send() {
    const text = input.trim();
    if (!text || sending || !product) return;
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setSending(true);
    setConfirmCheckout(false);
    setSplitNames(null);
    setError("");
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, messages: next.slice(-10) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "chat failed");
      setMessages([...next, { role: "assistant", content: data.reply }]);
      if (data.action === "checkout") setConfirmCheckout(true);
      if (data.action === "split" && Array.isArray(data.names)) {
        const names = cleanNames(data.names, buyerName.trim()).slice(0, 8);
        if (names.length >= 2) setSplitNames(names);
      }
    } catch {
      setMessages([
        ...next,
        { role: "assistant", content: "Sorry, I couldn't answer that. Please try again." },
      ]);
    } finally {
      setSending(false);
    }
  }

  async function pay() {
    if (payLock.current || splitLock.current || !product) return; payLock.current = true;
    setPaying(true);
    setError("");
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, buyerName: buyerName.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.approveUrl) {
        throw new Error(data.error || "Something went wrong, please try again.");
      }
      window.location.href = data.approveUrl; // stays disabled until the page leaves
    } catch (e) {
      setError(friendlyError(e));
      { setPaying(false); payLock.current = false; }
    }
  }

  // "Split with friends" form: buyer types the names
  function submitSplitForm(e: React.FormEvent) {
    e.preventDefault();
    const names = cleanNames(splitInput.split(/[,\n]/), buyerName.trim());
    if (names.length < 2) {
      setSplitFormError("Please add at least 2 different names, separated by commas.");
      return;
    }
    if (names.length > 8) {
      setSplitFormError("You can split between 8 people at most.");
      return;
    }
    setSplitFormError("");
    setError("");
    setConfirmCheckout(false);
    setSplitNames(names);
    setMessages((m) => [
      ...m,
      { role: "assistant", content: "Got it! Check the split below and confirm when you're ready." },
    ]);
  }

  async function confirmSplit() {
    if (splitLock.current || payLock.current || !product || !splitNames) return;
    splitLock.current = true;
    setSplitting(true);
    setError("");
    try {
      const res = await fetch("/api/split", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, names: splitNames }),
      });
      const data = await res.json();
      if (!res.ok || !data.orderId) {
        throw new Error(data.error || "Something went wrong, please try again.");
      }
      window.location.href = "/split/" + data.orderId; // stays disabled until the page leaves
    } catch (e) {
      setError(friendlyError(e));
      setSplitting(false);
      splitLock.current = false;
    }
  }

  if (state === "loading") {
    return <main className="p-6 text-gray-500">Loading...</main>;
  }

  if (state === "missing" || !product) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Product not found</h1>
          <Link href="/shop" className="mt-4 inline-block text-[#0F766E] underline">
            Back to shop
          </Link>
        </div>
      </main>
    );
  }

  const price = Number(product.price).toFixed(2);
  const details = Object.entries(product.details ?? {});

  // Split preview: same maths as the server, so the buttons never disagree with the tracker
  const shares = splitNames ? splitCents(toCents(Number(product.price)), splitNames.length) : [];
  const uneven = shares.length > 0 && shares[0] !== shares[shares.length - 1];
  const lowShare = shares.length ? centsToUsd(shares[shares.length - 1]) : "0.00";
  const busy = paying || splitting;

  return (
    <main className="min-h-dvh bg-[#FAFAF8] text-[#202B29]">
      <header className="border-b border-gray-100 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <Link href="/shop" className="text-2xl font-extrabold text-[#0F766E]">
            KADAI<span className="text-[#202B29]">.</span>
          </Link>
          <Link href="/shop" className="text-sm font-medium text-gray-600">
            Back to shop
          </Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl gap-6 p-4 md:grid-cols-2">
        <section>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={product.image_url}
            alt={product.name}
            className="aspect-square w-full rounded-xl object-cover"
          />
          <h1 className="mt-4 text-2xl font-semibold">{product.name}</h1>
          <p className="text-xl font-medium text-[#0F766E]">${price}</p>
          <p className="mt-2 text-gray-700">{product.description}</p>
          {details.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm text-gray-600">
              {details.map(([k, v]) => (
                <li key={k}>
                  <span className="font-medium capitalize">{k}:</span> {v}
                </li>
              ))}
            </ul>
          )}

          <input
            value={buyerName}
            onChange={(e) => setBuyerName(e.target.value)}
            maxLength={60}
            placeholder="Your name (optional)"
            className="mt-4 w-full rounded-xl border bg-white p-3 text-base sm:text-sm"
          />
          <button
            onClick={pay}
            disabled={busy}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#0F766E] px-4 py-3 font-medium text-white disabled:opacity-60"
          >
            {paying && <Spinner />}
            {paying ? "Opening PayPal..." : "Buy now"}
          </button>
          {splitEnabled && (
          <button
            type="button"
            onClick={() => setShowSplitForm((v) => !v)}
            disabled={busy}
            className="mt-2 w-full rounded-xl border border-[#0F766E] bg-white px-4 py-3 font-medium text-[#0F766E] disabled:opacity-60"
          >
            Split with friends
          </button>
          )}
          {splitEnabled && showSplitForm && (
            <form onSubmit={submitSplitForm} className="mt-2 space-y-2 rounded-xl border bg-white p-3">
              <label className="block text-sm font-medium text-gray-700">
                Who is paying? Include yourself.
              </label>
              <input
                value={splitInput}
                onChange={(e) => setSplitInput(e.target.value)}
                maxLength={200}
                placeholder="e.g. Arun, Divya, Karthik"
                className="w-full rounded-xl border p-3 text-base sm:text-sm"
              />
              {splitFormError && <p className="text-sm text-red-700">{splitFormError}</p>}
              <button
                type="submit"
                disabled={busy || !splitInput.trim()}
                className="w-full rounded-xl bg-[#0F766E] px-4 py-3 text-sm font-medium text-white disabled:opacity-60"
              >
                Continue
              </button>
            </form>
          )}
          {error && (
            <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>
          )}
        </section>

        <section className="flex h-[28rem] flex-col rounded-xl border bg-white md:h-auto md:min-h-[28rem]">
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <p
                  className={
                    "max-w-[85%] rounded-xl px-3 py-2 text-sm " +
                    (m.role === "user" ? "bg-[#0F766E] text-white" : "bg-gray-100 text-gray-800")
                  }
                >
                  {m.content}
                </p>
              </div>
            ))}
            {sending && <p className="text-sm text-gray-400">Typing...</p>}
            {confirmCheckout && (
              <button
                onClick={pay}
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0F766E] px-4 py-3 text-sm font-medium text-white disabled:opacity-60"
              >
                {paying && <Spinner />}
                {paying ? "Opening PayPal..." : "Confirm & pay $" + price}
              </button>
            )}
            {splitNames && (
              <div className="space-y-2">
                <button
                  onClick={confirmSplit}
                  disabled={busy}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0F766E] px-4 py-3 text-sm font-medium text-white disabled:opacity-60"
                >
                  {splitting && <Spinner />}
                  {splitting
                    ? "Creating split..."
                    : "Confirm split: " + splitNames.length + " people \u00D7 $" + lowShare}
                </button>
                <p className="text-center text-xs text-gray-500">
                  {splitNames.join(", ")}
                  {uneven && " \u2022 shares add up to exactly $" + price}
                </p>
              </div>
            )}
            {(confirmCheckout || splitNames) && error && (<p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>)}
            <div ref={bottomRef} />
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex gap-2 border-t p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={500}
              disabled={sending} placeholder="Ask about this product..."
              className="flex-1 rounded-xl border p-3 text-base sm:text-sm"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="rounded-xl bg-[#0F766E] px-4 text-sm font-medium text-white disabled:opacity-60"
            >
              Send
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

export default function ProductPage() {
  return (
    <Suspense fallback={<main className="p-6 text-gray-500">Loading...</main>}>
      <ProductPageInner />
    </Suspense>
  );
}
