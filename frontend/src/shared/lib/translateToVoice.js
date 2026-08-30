import { supabase } from "./supabaseClient.js";

function base64ToBlob(base64, contentType) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: contentType });
}

// Calls the translate-to-voice edge function and returns a playable object
// URL for the spoken translation. Callers are responsible for revoking the
// URL (URL.revokeObjectURL) once playback is done, if they hold onto it.
export async function translateToVoice(text, targetLanguage, sourceLanguage = "English") {
  const { data, error } = await supabase.functions.invoke("translate-to-voice", {
    body: { text, target_language: targetLanguage, source_language: sourceLanguage },
  });

  if (error) throw error;
  if (!data?.audio_base64) throw new Error(data?.error || "translate-to-voice returned no audio");

  const audioBlob = base64ToBlob(data.audio_base64, data.audio_content_type || "audio/mpeg");
  return {
    translatedText: data.translated_text,
    audioUrl: URL.createObjectURL(audioBlob),
  };
}
