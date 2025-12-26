import { useEffect, useRef } from 'react';

let speechSynthesis = null;
if (typeof window !== 'undefined') {
    speechSynthesis = window.speechSynthesis;
}

export const useVoiceGuidance = (enabled) => {
    const utteranceRef = useRef(null);

    const speak = (text) => {
        if (!enabled || !speechSynthesis) return;

        // Cancel any ongoing speech
        speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.9;
        utterance.pitch = 1;
        utterance.volume = 1;

        utteranceRef.current = utterance;
        speechSynthesis.speak(utterance);
    };

    const stop = () => {
        if (speechSynthesis) {
            speechSynthesis.cancel();
        }
    };

    useEffect(() => {
        return () => {
            stop();
        };
    }, []);

    return { speak, stop };
};

export const useVoiceCommand = (onCommand) => {
    const recognitionRef = useRef(null);

    const startListening = () => {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            return false;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();

        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            onCommand(transcript);
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
        };

        recognitionRef.current = recognition;
        recognition.start();
        return true;
    };

    const stopListening = () => {
        if (recognitionRef.current) {
            recognitionRef.current.stop();
        }
    };

    return { startListening, stopListening };
};