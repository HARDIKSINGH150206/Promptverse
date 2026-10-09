# Contract change proposals (backend → humans)

Nothing here changes the contract until a human updates . The backend keeps building to the current contract. Both items below are **additive**, so nothing existing breaks.

## 1.  (new, already live, optional for the frontend)

Server-side multilingual speech-to-text, as an alternative to the browser Web Speech API. Web Speech is Chrome/Edge only and weak on Hindi/Kannada code-mixing.

- Request:  with  (required; MediaRecorder webm/ogg is fine, < 30 s),  (optional, default  = auto-detect),  (optional).
- Response : -  if both Sarvam and Groq fail; the UI should fall back to the editable textarea.
- Suggested frontend flow: record with MediaRecorder → POST /api/transcribe → put  in the editable textarea → existing /parse call.

## 2.  gains 
An extra key; existing fields are unchanged.
