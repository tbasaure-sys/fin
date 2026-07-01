"use client";

import Link from "next/link";
import { useEffect } from "react";

const rawAppName = process.env.NEXT_PUBLIC_BLS_APP_NAME || "BLS Prime";
const appName = /allocator workspace/i.test(rawAppName) ? "BLS Prime" : rawAppName;

export default function Error({ error, reset }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="status-page">
      <div className="status-shell premium-card">
        <p className="landing-kicker">Workspace problem</p>
        <p className="brand-wordmark">{appName}</p>
        <h1>We could not open the workspace.</h1>
        <p className="landing-support">
          Try the workspace again. If the problem persists, open AURORA and refresh the live data.
        </p>
        <div className="hero-cta-row">
          <button className="primary-button" onClick={() => reset()}>
            Try again
          </button>
          <Link className="ghost-button" href="/aurora">
            AURORA
          </Link>
          <Link className="ghost-button" href="/">
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
