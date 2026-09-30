import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import { db } from '../store/db';
import { useNavigate } from 'react-router-dom';

export default function VoiceAssistant() {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const recognitionRef = useRef<any>(null);
  const navigate = useNavigate();

  // Lazy initialize Gemini to prevent crash on load if key is missing
  const getAI = () => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('Chýba Gemini API kľúč. Skontrolujte nastavenia prostredia.');
    }
    return new GoogleGenAI({ apiKey });
  };

  useEffect(() => {
    // Check for SpeechRecognition support
    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'sk-SK'; // Slovak language

      recognition.onstart = () => {
        setIsListening(true);
        setTranscript('');
        showNotification('Počúvam...', 'info');
      };

      recognition.onresult = (event: any) => {
        let currentTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript;
        }
        setTranscript(currentTranscript);
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        setIsListening(false);
        if (event.error !== 'no-speech') {
          showNotification('Chyba pri rozpoznávaní reči.', 'error');
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        // If we have a transcript, process it
        if (transcriptRef.current) {
          processTranscript(transcriptRef.current);
        } else {
          setNotification(null);
        }
      };

      recognitionRef.current = recognition;
    } else {
      console.warn('SpeechRecognition is not supported in this browser.');
    }
  }, []);

  // Use a ref to access the latest transcript in onend
  const transcriptRef = useRef(transcript);
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  const showNotification = (message: string, type: 'success' | 'error' | 'info') => {
    setNotification({ message, type });
    if (type !== 'info') {
      setTimeout(() => setNotification(null), 4000);
    }
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      recognitionRef.current?.start();
    }
  };

  const processTranscript = async (text: string) => {
    if (!text.trim()) return;
    
    setIsProcessing(true);
    showNotification('Spracovávam požiadavku...', 'info');

    try {
      const ai = getAI();
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Analyzuj nasledujúci text a extrahuj informácie pre servisnú objednávku. 
        Dnešný dátum je ${new Date().toISOString().split('T')[0]}.
        Text: "${text}"`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              device: { type: Type.STRING, description: 'Názov zariadenia (napr. iPhone 12, Samsung S21)' },
              type: { type: Type.STRING, description: 'Typ opravy (napr. Výmena batérie, Rozbitý displej)' },
              price: { type: Type.NUMBER, description: 'Cena opravy v eurách (len číslo)' },
              date: { type: Type.STRING, description: 'Dátum opravy vo formáte YYYY-MM-DD. Ak je povedané "na zajtra", "v nedeľu" atď., vypočítaj presný dátum.' },
              time: { type: Type.STRING, description: 'Čas opravy vo formáte "HH:MM - HH:MM" (napr. "10:00 - 11:00"). Ak nie je špecifikovaný, použi "09:00 - 10:00".' },
              urgency: { type: Type.STRING, description: 'Urgentnosť: "Nízka", "Stredná", "Vysoká", "Kritická". Predvolene "Stredná".' }
            },
            required: ['device', 'type']
          }
        }
      });

      const data = JSON.parse(response.text || '{}');
      
      if (data.device && data.type) {
        // Create the repair order
        await db.addRepair({
          device: data.device,
          type: data.type,
          price: data.price || 0,
          cost: 0,
          profit: data.price || 0,
          customer: 'Nezadané (z hlasu)',
          phone: '',
          status: 'Čaká sa',
          partsStatus: 'Na overenie',
          date: data.date || new Date().toISOString().split('T')[0],
          time: data.time || '09:00 - 10:00',
          urgency: data.urgency || 'Stredná',
          notes: `Vytvorené hlasovým asistentom. Originálny text: "${text}"`
        });
        
        showNotification('Objednávka bola úspešne vytvorená!', 'success');
        
        // Optional: refresh the page or navigate to repairs to see it
        if (window.location.pathname === '/repairs') {
          window.location.reload();
        }
      } else {
        showNotification('Nepodarilo sa rozpoznať detaily opravy.', 'error');
      }
    } catch (error: any) {
      console.error('Error processing voice command:', error);
      showNotification(`Chyba AI: ${error.message || 'Neznáma chyba'}`, 'error');
    } finally {
      setIsProcessing(false);
      setTranscript('');
    }
  };

  if (!window.SpeechRecognition && !(window as any).webkitSpeechRecognition) {
    return null; // Don't render if not supported
  }

  return (
    <div className="fixed bottom-20 lg:bottom-8 right-4 lg:right-8 z-50 flex flex-col items-end gap-4">
      {/* Notification / Transcript Bubble */}
      {(isListening || isProcessing || notification) && (
        <div className="bg-white dark:bg-surface-dark border border-slate-200 dark:border-[#324d67] shadow-xl rounded-2xl p-4 max-w-[300px] animate-in slide-in-from-bottom-4 fade-in duration-300">
          {notification && (
            <div className={`text-sm font-bold mb-1 flex items-center gap-2 ${
              notification.type === 'success' ? 'text-emerald-500' : 
              notification.type === 'error' ? 'text-red-500' : 
              'text-primary'
            }`}>
              <span className="material-symbols-outlined text-[18px]">
                {notification.type === 'success' ? 'check_circle' : 
                 notification.type === 'error' ? 'error' : 'info'}
              </span>
              {notification.message}
            </div>
          )}
          {transcript && (
            <p className="text-sm text-slate-600 dark:text-slate-300 italic">"{transcript}"</p>
          )}
          {isProcessing && (
            <div className="flex gap-1 mt-2">
              <div className="size-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="size-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="size-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>
          )}
        </div>
      )}

      {/* FAB Button */}
      <button
        onClick={toggleListening}
        disabled={isProcessing}
        className={`relative flex items-center justify-center size-14 rounded-full shadow-lg transition-all duration-300 ${
          isListening 
            ? 'bg-red-500 text-white shadow-red-500/30 scale-110' 
            : isProcessing
            ? 'bg-slate-200 dark:bg-surface-dark text-slate-400 cursor-not-allowed'
            : 'bg-primary text-white hover:bg-blue-600 hover:scale-105 shadow-primary/30'
        }`}
        title="Hlasový asistent"
      >
        <span className="material-symbols-outlined text-[28px]">
          {isListening ? 'mic' : isProcessing ? 'hourglass_empty' : 'mic'}
        </span>
        
        {/* Ripple effect when listening */}
        {isListening && (
          <>
            <div className="absolute inset-0 rounded-full border-2 border-red-500 animate-ping opacity-75"></div>
            <div className="absolute -inset-2 rounded-full border border-red-500 animate-ping opacity-50" style={{ animationDelay: '300ms' }}></div>
          </>
        )}
      </button>
    </div>
  );
}
