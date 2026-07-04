# 👁️ MagicMirror

> An interactive, AI-driven digital orb that reacts to your gaze, emotions, and facial entropy in real-time.

MagicMirror is an experimental web application that merges computer vision with generative art. It renders a dynamic, magical "Eye Orb" or Sauron Eye right in your browser. By leveraging client-side tracking, the orb follows your gaze, gets stimulated by your emotional state, and morphs its shape based on the entropy of your facial expressions. 

All primary processing runs entirely on the client side to ensure absolute privacy and zero latency.

---

## ✨ Features

* **Real-Time Gaze Tracking:** The orb continuously tracks and follows the user's eye movements.
* **Emotion & Entropy Reactivity:** The visual state (shape, lighting, and movement) dynamically alters based on the user's detected emotional state and facial entropy.
* **Client-Side Processing:** Powered by MediaPipe in the browser, ensuring user privacy (requires explicit webcam permission).
* **Generative Visuals:** Utilizes complex mathematical patterns, including Julia fractals and dynamic lighting, to create mesmerizing effects.

---

## Visual Modes (Current)

1. **The Sauron Eye:** A fiery, intense orb that focuses sharply on the user, reacting aggressively to high-entropy expressions.
2. **Kaleidoscope:** A mesmerizing, symmetrical pattern that shifts and breathes smoothly based on emotional calmness and subtle facial changes.

---

## 🛠️ Tech Stack

### Frontend (The Magic)
* **HTML5 / CSS3:** Structure and fluid, high-tech UI styling.
* **JavaScript (Vanilla/ES6+):** Core logic, animations, and DOM manipulation.
* **MediaPipe:** Real-time face mesh, gaze tracking, and emotion/entropy detection running directly in the browser.

### Backend (The Brain)
* **FastAPI (Python):** A lightweight, lightning-fast backend API designed to handle future LLM integrations and external routing.

---

## 🚀 Future Roadmap

MagicMirror is actively evolving. The upcoming features will transform it from a visual reactor into a fully interactive entity:

- [ ] **Deep Dream Effects:** Implementation of WebGL-based Instagram-style filters to distort and enhance the user's camera feed.
- [ ] **Conversational AI Agent:** Integration with **OpenAI GPT API** to give the orb a personality.
- [ ] **Voice Synthesis (TTS):** Giving the orb a voice using the **Kokoro** engine.
- [ ] **Auditory Perception (STT):** Allowing the user to speak directly to the orb using **Whisper**.

---

Disclaimer: MagicMirror processes all biometric data (gaze and facial mapping) locally on your device. No video feeds or images are stored or transmitted to external servers.

