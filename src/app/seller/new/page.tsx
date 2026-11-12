"use client";

import { useEffect, useState } from "react";
import { friendlyError } from "@/lib/errors";

const MAX_FILE_SIZE = 4 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

function Spinner() {
  return (
    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
  );
}

// Turn the Details box ("weight: 1 kg" on each line) into { weight: "1 kg" }.
// A line without ":" is kept under "Note".
function parseDetails(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    const i = t.indexOf(":");
    let key = i > 0 ? t.slice(0, i).trim() : "Note";
    const value = i > 0 ? t.slice(i + 1).trim() : t;
    if (!value) continue;
    if (out[key]) key = `${key} ${Object.keys(out).length + 1}`;
    if (Object.keys(out).length < 6) out[key] = value;
  }
  return out;
}

export default function NewProductPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  const [note, setNote] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [details, setDetails] = useState("");

  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];

    setError("");
    setMessage("");
    setImageUrl("");
    setFile(null);
    setPreview("");

    if (!selected) return;

    if (selected.size > MAX_FILE_SIZE) {
      setError("That photo is too big. Please use one under 4 MB.");
      event.target.value = "";
      return;
    }

    if (!ALLOWED_TYPES.includes(selected.type)) {
      setError("Only photos are allowed (JPG, PNG or WEBP).");
      event.target.value = "";
      return;
    }

    setFile(selected);
    setPreview(URL.createObjectURL(selected));
  }

  async function handleGenerate() {
    if (!file) {
      setError("Please upload a product photo first.");
      return;
    }

    setGenerating(true);
    setError("");
    setMessage("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("note", note.trim());

      const response = await fetch("/api/ai/listing", {
        method: "POST",
        body: formData,
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "AI is busy, please fill the details yourself.");
      }

      if (result.image_url) setImageUrl(result.image_url);

      if (result.ai_failed) {
        setMessage("AI is busy, please fill the details yourself.");
        return;
      }

      setName(result.name || "");
      setDescription(result.description || "");
      setPrice(result.suggested_price_usd != null ? String(result.suggested_price_usd) : "");

      const d = result.details;
      setDetails(
        typeof d === "string"
          ? d
          : d && typeof d === "object"
          ? Object.entries(d).map(([k, v]) => `${k}: ${v}`).join("\n")
          : ""
      );

      setMessage("Product details generated successfully!");
    } catch (err) {
      setMessage("");
      setError(friendlyError(err));
    } finally {
      setGenerating(false);
    }
  }

  async function handlePublish(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (publishing) return;

    setError("");
    setMessage("");

    const numericPrice = Number(price);

    if (!name.trim() || !price.trim() || !Number.isFinite(numericPrice) || numericPrice <= 0) {
      setError("Please add a name and a price above $0.");
      return;
    }

    if (!description.trim()) {
      setError("Please add a description.");
      return;
    }

    if (!imageUrl) {
      setError("Please upload a product photo first, then click Generate with AI once so the photo is saved.");
      return;
    }

    setPublishing(true);

    try {
      const response = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          price: numericPrice,
          image_url: imageUrl,
          details: parseDetails(details),
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not publish the product. Please try again.");
      }

      // Full page load. Stay in the "Publishing..." state while the page leaves.
      window.location.href = "/seller";
    } catch (err) {
      setError(friendlyError(err));
      setPublishing(false);
    }
  }

  return (
    <main className="mx-auto min-h-dvh max-w-3xl p-4 sm:p-6">
      <div className="mb-6">
        <a
          href="/seller"
          className="mb-4 inline-block text-sm text-gray-500 hover:text-gray-900"
        >
          {"\u2190 Back to dashboard"}
        </a>

        <h1 className="text-2xl font-bold text-gray-900">Add a new product</h1>
        <p className="mt-1 text-sm text-gray-500">
          Upload a photo and let AI help create your product listing.
        </p>
      </div>

      <div className="space-y-6">
        <section className="rounded-2xl border bg-white p-4 sm:p-6">
          <h2 className="mb-4 text-lg font-semibold">1. Product photo</h2>

          <label className="block cursor-pointer rounded-xl border-2 border-dashed border-gray-300 p-6 text-center hover:border-[#0F766E]">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              className="hidden"
            />
            <span className="text-sm font-medium text-gray-700">Click to upload product photo</span>
            <span className="mt-1 block text-xs text-gray-500">
              {"JPG, PNG or WEBP \u00B7 Maximum 4 MB"}
            </span>
          </label>

          {preview && (
            <div className="mt-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt="Product preview"
                className="max-h-64 w-full rounded-xl object-contain"
              />
              <p className="mt-2 text-xs text-gray-500">{file?.name}</p>
            </div>
          )}

          <div className="mt-5">
            <label className="mb-2 block text-sm font-medium">Optional product note</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Example: Homemade chocolate brownie, eggless, 1 kg, 2-day delivery"
              className="w-full rounded-xl border p-3 text-base outline-none focus:border-[#0F766E] sm:text-sm"
            />
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={!file || generating || publishing}
            aria-busy={generating}
            className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0F766E] px-5 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generating && <Spinner />}
            {generating ? "Writing your listing..." : "\u2728 Generate with AI"}
          </button>
        </section>

        {message && (
          <p role="status" className="rounded-xl bg-blue-50 p-3 text-sm text-blue-800">
            {message}
          </p>
        )}

        {error && (
          <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <form
          onSubmit={handlePublish}
          className="space-y-5 rounded-2xl border bg-white p-4 sm:p-6"
        >
          <div>
            <h2 className="text-lg font-semibold">2. Product details</h2>
            <p className="mt-1 text-sm text-gray-500">
              Review and edit the AI-generated information before publishing.
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">Product name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              placeholder="Enter product name"
              className="w-full rounded-xl border p-3 text-base outline-none focus:border-[#0F766E] sm:text-sm"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">Description *</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={1000}
              rows={4}
              placeholder="Describe your product"
              className="w-full rounded-xl border p-3 text-base outline-none focus:border-[#0F766E] sm:text-sm"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">Price (USD) *</label>
            <div className="flex items-center rounded-xl border px-3 focus-within:border-[#0F766E]">
              <span className="text-gray-500">$</span>
              <input
                type="number"
                inputMode="decimal"
                min="0.01"
                max="10000"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                className="w-full p-3 text-base outline-none sm:text-sm"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">Details</label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={3}
              placeholder={"One per line, e.g.\nweight: 1 kg\neggless: yes"}
              className="w-full rounded-xl border p-3 text-base outline-none focus:border-[#0F766E] sm:text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={publishing || generating}
            aria-busy={publishing}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0F766E] px-5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {publishing && <Spinner />}
            {publishing ? "Publishing..." : "Publish product"}
          </button>
        </form>
      </div>
    </main>
  );
}

