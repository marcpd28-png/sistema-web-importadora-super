"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { useAdminMobile } from "./use-admin-mobile";

export function MobileDisclosure({ title, children }: { title: string; children: ReactNode }) {
  const mobile = useAdminMobile();
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  return (
    <section className="admin-mobile-disclosure" data-expanded={expanded}>
      <button className="admin-mobile-disclosure-toggle" type="button" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(!expanded)}>
        <span>{title}</span><ChevronDown size={18} aria-hidden="true" />
      </button>
      <div id={id} hidden={mobile && !expanded}>
        {!mobile || expanded ? children : null}
      </div>
    </section>
  );
}
