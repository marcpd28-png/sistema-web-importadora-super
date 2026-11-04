"use client";

import { FormEvent, useState } from "react";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  MessageSquareText,
  RotateCcw,
  Send,
  Sparkles,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ratingOptions = [
  { value: "BAD", label: "Mala", stars: 1 },
  { value: "REGULAR", label: "Regular", stars: 3 },
  { value: "GOOD", label: "Buena", stars: 4 },
  { value: "VERY_GOOD", label: "Muy buena", stars: 5 },
] as const;

type Rating = (typeof ratingOptions)[number]["value"];
type YesNo = "yes" | "no" | null;

type ApiResponse =
  | { ok: true }
  | {
      ok: false;
      message?: string;
    };

export function ServiceFeedbackForm() {
  const [rating, setRating] = useState<Rating | null>(null);
  const [hadProblem, setHadProblem] = useState<YesNo>(null);
  const [wouldRecommend, setWouldRecommend] = useState<YesNo>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!rating || !hadProblem || !wouldRecommend) {
      setSubmitError("Completa las preguntas marcadas como obligatorias.");
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch("/api/service-feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rating,
          attendedBy: String(formData.get("attendedBy") ?? ""),
          improvement: String(formData.get("improvement") ?? ""),
          hadProblem: hadProblem === "yes",
          problemDetail: String(formData.get("problemDetail") ?? ""),
          wouldRecommend: wouldRecommend === "yes",
          customerContact: String(formData.get("customerContact") ?? ""),
          website: String(formData.get("website") ?? ""),
        }),
      });
      const payload = (await response.json()) as ApiResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(
          !payload.ok && payload.message
            ? payload.message
            : "No pudimos guardar tu opinión. Intenta nuevamente.",
        );
      }

      form.reset();
      setIsComplete(true);
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "No pudimos guardar tu opinión. Intenta nuevamente.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function startAnotherResponse() {
    setRating(null);
    setHadProblem(null);
    setWouldRecommend(null);
    setSubmitError(null);
    setIsComplete(false);
  }

  if (isComplete) {
    return (
      <section className="service-feedback-success" aria-live="polite">
        <div className="service-feedback-success-icon">
          <CheckCircle2 aria-hidden="true" size={38} strokeWidth={1.8} />
        </div>
        <p className="service-feedback-kicker">Opinión registrada</p>
        <h2>Gracias por ayudarnos a mejorar.</h2>
        <p>
          Tu respuesta quedó guardada. La revisaremos para ofrecerte una atención cada vez mejor.
        </p>
        <button className="service-feedback-restart" onClick={startAnotherResponse} type="button">
          <RotateCcw aria-hidden="true" size={17} />
          Registrar otra respuesta
        </button>
      </section>
    );
  }

  return (
    <form className="service-feedback-form" onSubmit={handleSubmit}>
      <div className="service-feedback-form-intro">
        <span>
          <Sparkles aria-hidden="true" size={15} />
          Encuesta breve
        </span>
        <p>Los campos con * son obligatorios.</p>
      </div>

      <fieldset className="service-feedback-question service-feedback-rating">
        <legend>
          <span>01</span>
          ¿Cómo calificas la atención recibida? *
        </legend>
        <div className="service-feedback-rating-grid">
          {ratingOptions.map((option) => (
            <label
              className={cn(
                "service-feedback-rating-option",
                rating === option.value && "is-selected",
              )}
              key={option.value}
            >
              <input
                checked={rating === option.value}
                name="rating"
                onChange={() => setRating(option.value)}
                required
                type="radio"
                value={option.value}
              />
              <span className="service-feedback-rating-stars" aria-hidden="true">
                {Array.from({ length: option.stars }, (_, index) => (
                  <Star
                    fill="currentColor"
                    key={index}
                    size={17}
                    strokeWidth={1.8}
                  />
                ))}
              </span>
              <strong>{option.label}</strong>
              <span className="service-feedback-option-check">
                <Check size={13} strokeWidth={3} />
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="service-feedback-question service-feedback-text-field">
        <span className="service-feedback-question-title">
          <span>02</span>
          ¿Quién te atendió?
        </span>
        <span className="service-feedback-label-help">
          Nombre del vendedor o una breve descripción
        </span>
        <input
          autoComplete="off"
          maxLength={180}
          name="attendedBy"
          placeholder="Ej. Carlos o joven con polo azul"
        />
      </label>

      <label className="service-feedback-question service-feedback-text-field">
        <span className="service-feedback-question-title">
          <span>03</span>
          ¿Qué podemos mejorar?
        </span>
        <textarea
          maxLength={2000}
          name="improvement"
          placeholder="Cuéntanos qué haría mejor tu próxima visita..."
          rows={4}
        />
      </label>

      <fieldset className="service-feedback-question">
        <legend>
          <span>04</span>
          ¿Tuviste algún problema con la atención? *
        </legend>
        <div className="service-feedback-segmented">
          {(["no", "yes"] as const).map((value) => (
            <label className={cn(hadProblem === value && "is-selected")} key={value}>
              <input
                checked={hadProblem === value}
                name="hadProblem"
                onChange={() => setHadProblem(value)}
                required
                type="radio"
                value={value}
              />
              {value === "yes" ? "Sí" : "No"}
            </label>
          ))}
        </div>

        {hadProblem === "yes" ? (
          <label className="service-feedback-followup">
            <span>Explícanos brevemente qué sucedió *</span>
            <textarea
              autoFocus
              maxLength={2000}
              name="problemDetail"
              placeholder="Describe el inconveniente para poder revisarlo..."
              required
              rows={3}
            />
          </label>
        ) : null}
      </fieldset>

      <fieldset className="service-feedback-question">
        <legend>
          <span>05</span>
          ¿Nos recomendarías? *
        </legend>
        <div className="service-feedback-segmented">
          {(["yes", "no"] as const).map((value) => (
            <label className={cn(wouldRecommend === value && "is-selected")} key={value}>
              <input
                checked={wouldRecommend === value}
                name="wouldRecommend"
                onChange={() => setWouldRecommend(value)}
                required
                type="radio"
                value={value}
              />
              {value === "yes" ? "Sí, los recomendaría" : "No por ahora"}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="service-feedback-question service-feedback-text-field">
        <span className="service-feedback-question-title">
          <span>06</span>
          Tu nombre o teléfono
          <small>Opcional</small>
        </span>
        <input
          autoComplete="name"
          maxLength={180}
          name="customerContact"
          placeholder="Déjalo si deseas que te contactemos"
        />
      </label>

      <label className="service-feedback-honeypot" aria-hidden="true">
        Sitio web
        <input autoComplete="off" name="website" tabIndex={-1} />
      </label>

      {submitError ? (
        <div className="service-feedback-error" role="alert">
          <MessageSquareText aria-hidden="true" size={18} />
          <span>{submitError}</span>
        </div>
      ) : null}

      <button className="service-feedback-submit" disabled={isSubmitting} type="submit">
        <span>
          <Send aria-hidden="true" size={18} />
          {isSubmitting ? "Enviando opinión..." : "Enviar mi opinión"}
        </span>
        <ArrowRight aria-hidden="true" size={18} />
      </button>

      <p className="service-feedback-privacy">
        Usaremos esta información únicamente para mejorar nuestra atención.
      </p>
    </form>
  );
}
