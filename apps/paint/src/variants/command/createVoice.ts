import { createSignal, onCleanup } from 'solid-js';

/**
 * Speech input through the browser's `SpeechRecognition` (`webkitSpeechRecognition` in Chrome and Safari), one
 * utterance at a time in the page's language. `heard` follows the words as they are recognized; when listening ends,
 * by `stop`, a pause or the end of the utterance, `onResult` receives the whole transcript, unless nothing was heard.
 * Recognition failures other than a cancel are reported through `onError` in words for the user. Where the browser
 * has no speech recognition, `supported` is false and `start` does nothing. Must be created within a Solid owner;
 * disposal aborts listening.
 */
export function createVoice(options: { onResult: (transcript: string) => void; onError: (message: string) => void }) {
  const Recognition = recognitionConstructor();
  const [listening, setListening] = createSignal(false);
  const [heard, setHeard] = createSignal('');
  let current: Recognition | undefined;

  onCleanup(() => current?.abort());

  return {
    supported: Recognition !== undefined,
    listening,
    /** What was recognized of the current or last utterance. */
    heard,
    /** Starts listening, unless already listening. */
    start() {
      if (!Recognition || current) {
        return;
      }

      const recognition = new Recognition();
      let transcript = '';
      recognition.lang = navigator.language;
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.maxAlternatives = 1;
      recognition.onresult = (event) => {
        transcript = Array.from(event.results, (result) => result[0]?.transcript ?? '')
          .join('')
          .trim();
        setHeard(transcript);
      };
      recognition.onerror = (event) => {
        if (event.error !== 'aborted') {
          options.onError(errorMessages[event.error] ?? `Speech recognition failed: ${event.error}.`);
        }
      };
      recognition.onend = () => {
        current = undefined;
        setListening(false);
        if (transcript) {
          options.onResult(transcript);
        }
      };
      current = recognition;
      setHeard('');
      setListening(true);
      try {
        recognition.start();
      } catch {
        current = undefined;
        setListening(false);
        options.onError('Speech recognition could not start.');
      }
    },
    /** Stops listening; what was heard so far is still delivered. */
    stop() {
      current?.stop();
    }
  };
}

/** The part of the Web Speech API this uses; TypeScript's DOM library does not declare it. */
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function recognitionConstructor(): (new () => Recognition) | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const speech = window as unknown as Record<
    'SpeechRecognition' | 'webkitSpeechRecognition',
    (new () => Recognition) | undefined
  >;
  return speech.SpeechRecognition ?? speech.webkitSpeechRecognition;
}

const errorMessages: Record<string, string> = {
  'no-speech': 'Nothing was heard. Hold the button and speak.',
  'not-allowed': 'The microphone is blocked for this page.',
  'service-not-allowed': 'Speech recognition is not allowed here.',
  'audio-capture': 'No microphone was found.',
  network: 'Speech recognition needs a network connection.'
};
