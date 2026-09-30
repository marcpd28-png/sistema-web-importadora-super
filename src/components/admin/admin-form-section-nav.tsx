"use client";

import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type AdminFormSection = {
  id: string;
  label: string;
  description: string;
};

type AdminFormSectionNavProps = {
  label: string;
  sections: AdminFormSection[];
};

export function AdminFormSectionNav({ label, sections }: AdminFormSectionNavProps) {
  const [activeId, setActiveId] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    const elements = sections
      .map((section) => document.getElementById(section.id))
      .filter((element): element is HTMLElement => Boolean(element));

    if (!elements.length) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (visibleEntry?.target.id) {
          setActiveId(visibleEntry.target.id);
        }
      },
      {
        rootMargin: "-18% 0px -64% 0px",
        threshold: [0.05, 0.25, 0.5],
      },
    );

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav aria-label={label} className="admin-form-section-nav">
      <label className="admin-mobile-section-select">
        <span>Ir a sección</span>
        <select aria-label="Ir a sección" value={activeId} onChange={event => {
          const id = event.target.value;
          setActiveId(id);
          document.getElementById(id)?.scrollIntoView({ block: "start" });
          window.history.replaceState(window.history.state, "", `#${id}`);
        }}>
          {sections.map((section, index) => <option value={section.id} key={section.id}>{index + 1}. {section.label}</option>)}
        </select>
      </label>
      <div className="admin-form-section-nav-track">
        {sections.map((section, index) => {
          const isActive = activeId === section.id;

          return (
            <a
              aria-current={isActive ? "location" : undefined}
              className={cn("admin-form-section-link", isActive && "is-active")}
              href={`#${section.id}`}
              key={section.id}
              onClick={() => setActiveId(section.id)}
            >
              <span className="admin-form-section-step" aria-hidden="true">
                {isActive ? <CheckCircle2 size={16} /> : index + 1}
              </span>
              <span className="admin-form-section-copy">
                <strong>{section.label}</strong>
                <small>{section.description}</small>
              </span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
