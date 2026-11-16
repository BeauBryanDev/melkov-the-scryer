/*
   VISION-STYLES — the shared chrome of the vision overlay: host, veil, rail,
   base card, arrows, the detail panel shell and the few widgets several
   domains reuse (.btn, .chips, .strip, h4, .msg). Domain-specific rules live
   in each vision-<domain>.js and are appended AFTER this block.
*/

import { PALETTE } from "./vision-shared.js";

export const styles = `
        :host {
          display: block;
          font-family: "Courier New", monospace;
          letter-spacing: 1px;
          color: ${PALETTE.text};
          opacity: 0;
          pointer-events: none;
          transition: opacity 500ms ease;
        }
        :host(.visible) { opacity: 1; pointer-events: auto; }
        .veil {
          position: absolute; inset: 0;
          background: radial-gradient(ellipse at center, rgba(10,20,24,0.55) 0%, rgba(3,5,7,0.85) 75%);
        }
        .rail {
          position: relative;
          height: 100%;
          display: flex;
          align-items: center;
          gap: 22px;
          padding: 0 48px;
          overflow-x: auto;
          overflow-y: hidden;
          scrollbar-width: thin;
        }
        .card {
          flex: 0 0 auto;
          background: ${PALETTE.cardBg};
          border: 1px solid ${PALETTE.border};
          box-shadow: 0 0 24px ${PALETTE.borderGlow}, inset 0 0 18px rgba(53,224,242,0.06);
          backdrop-filter: blur(8px);
          border-radius: 4px;
          opacity: 0;
          transform: scale(0.9) translateY(12px);
          animation: card-in 480ms ease forwards;
        }
        @keyframes card-in {
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .rail { scroll-snap-type: x proximity; scroll-padding: 0 48px; cursor: grab; }
        .rail.dragging, .strip.dragging { scroll-snap-type: none; cursor: grabbing; user-select: none; }
        .card { scroll-snap-align: start; user-select: none; -webkit-user-select: none; }
        img { -webkit-user-drag: none; }
        .arrow {
          position: absolute; top: 50%; transform: translateY(-50%); z-index: 2;
          width: 44px; height: 64px; border: 1px solid ${PALETTE.border}; background: ${PALETTE.cardBg};
          color: ${PALETTE.accent}; font-size: 22px; cursor: pointer; border-radius: 4px;
          box-shadow: 0 0 14px ${PALETTE.borderGlow}; transition: opacity 200ms ease;
        }
        .arrow:hover { background: rgba(53,224,242,0.15); }
        .arrow--prev { left: 6px; } .arrow--next { right: 6px; }
        .arrow[hidden] { display: none; }

        .detail {
          position: absolute; inset: 0; z-index: 3; overflow-y: auto; padding: 28px 48px 48px;
          background: rgba(3,5,7,0.94); opacity: 0; pointer-events: none; transition: opacity 250ms ease;
        }
        .detail.open { opacity: 1; pointer-events: auto; }
        .btn {
          font: inherit; letter-spacing: 2px; font-size: 12px; padding: 9px 16px; cursor: pointer;
          color: ${PALETTE.accent}; background: rgba(53,224,242,0.08); border: 1px solid ${PALETTE.border}; border-radius: 4px;
        }
        .btn:hover { background: rgba(53,224,242,0.2); box-shadow: 0 0 14px ${PALETTE.borderGlow}; }
        .d-top { display: flex; gap: 28px; margin-top: 18px; align-items: flex-start; }
        .d-info { flex: 1; min-width: 0; }
        .d-info h2 { font-size: 24px; margin-bottom: 6px; }
        .d-meta { color: ${PALETTE.textDim}; font-size: 12px; margin-bottom: 8px; }
        h4 { margin: 28px 0 10px; font-size: 11px; letter-spacing: 3px; color: ${PALETTE.textDim}; }
        .strip { display: flex; gap: 14px; overflow-x: auto; padding: 4px 2px 12px; cursor: grab; scrollbar-width: thin; }
        .msg { margin-top: 40px; text-align: center; color: ${PALETTE.textDim}; letter-spacing: 3px; font-size: 12px; }
        .chips { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
        .chip {
          font-size: 9px; letter-spacing: 1px; padding: 2px 8px;
          border: 1px solid rgba(139,233,253,0.3); color: ${PALETTE.textDim};
          border-radius: 12px;
        }
        @media (max-width: 767px) {
          .detail { padding: 18px 16px 32px; }
          .d-top { flex-direction: column; }
          .arrow { display: none; }
        }
`;
