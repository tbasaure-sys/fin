"use client";

import { InfoTip } from "@/components/ui/info-tip";
import { cleanDisplayValue } from "@/lib/copy/format";

import styles from "./plain-metric.module.css";

export function PlainMetric({
  className = "",
  definitionKey,
  detail,
  language = "en",
  plain,
  techLabel,
  tone = "neutral",
  trend,
  value,
}) {
  const displayValue = cleanDisplayValue(value);

  return (
    <article className={`${styles.metric} ${className}`} data-tone={tone}>
      {plain ? <p className={styles.plain}>{plain}</p> : null}
      <strong className={styles.value}>{displayValue}</strong>
      <span className={styles.tech}>
        {techLabel}
        {definitionKey ? <InfoTip definitionKey={definitionKey} language={language} /> : null}
      </span>
      {trend || detail ? (
        <small className={styles.detail}>
          {trend ? <span>{trend}</span> : null}
          {detail ? <span>{detail}</span> : null}
        </small>
      ) : null}
    </article>
  );
}
