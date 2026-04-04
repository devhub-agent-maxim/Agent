'use client';

import { useState, useRef } from 'react';

interface AddressInputProps {
  addresses: string[];
  onChange: (addresses: string[]) => void;
}

export default function AddressInput({ addresses, onChange }: AddressInputProps) {
  const [singleInput, setSingleInput] = useState('');
  const [pasteMode, setPasteMode] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function addSingle() {
    const trimmed = singleInput.trim();
    if (!trimmed) return;
    onChange([...addresses, trimmed]);
    setSingleInput('');
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addSingle();
    }
  }

  function applyBulk() {
    const lines = bulkText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return;
    onChange([...addresses, ...lines]);
    setBulkText('');
    setPasteMode(false);
  }

  function removeAddress(index: number) {
    onChange(addresses.filter((_, i) => i !== index));
  }

  function clearAll() {
    onChange([]);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Delivery Addresses</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPasteMode(!pasteMode)}
            className="text-xs px-3 py-1 rounded-md border border-slate-600 text-slate-300 hover:border-green-500 hover:text-green-400 transition-colors"
          >
            {pasteMode ? 'Single mode' : 'Paste bulk'}
          </button>
          {addresses.length > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="text-xs px-3 py-1 rounded-md border border-slate-600 text-slate-400 hover:border-red-500 hover:text-red-400 transition-colors"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {pasteMode ? (
        <div className="space-y-2">
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={'Paste addresses, one per line:\n\nJurong East MRT, Singapore\nTampines Mall, Singapore\nOrchard Road, Singapore'}
            rows={6}
            className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 text-sm focus:outline-none focus:border-green-500 resize-none"
          />
          <button
            type="button"
            onClick={applyBulk}
            disabled={!bulkText.trim()}
            className="w-full py-2 bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            Add {bulkText.split('\n').filter((l) => l.trim()).length} address(es)
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={singleInput}
            onChange={(e) => setSingleInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. Tampines Mall, Singapore"
            className="flex-1 px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 text-sm focus:outline-none focus:border-green-500"
          />
          <button
            type="button"
            onClick={addSingle}
            disabled={!singleInput.trim()}
            className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            Add
          </button>
        </div>
      )}

      {addresses.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-slate-400 font-medium">
            {addresses.length} address{addresses.length !== 1 ? 'es' : ''} added
          </p>
          <ul className="space-y-1 max-h-56 overflow-y-auto pr-1">
            {addresses.map((addr, i) => (
              <li
                key={i}
                className="flex items-center gap-2 px-3 py-2 bg-slate-800 rounded-lg border border-slate-700 group"
              >
                <span className="text-xs font-mono text-slate-500 w-5 shrink-0">{i + 1}</span>
                <span className="flex-1 text-sm text-slate-200 truncate">{addr}</span>
                <button
                  type="button"
                  onClick={() => removeAddress(i)}
                  className="text-slate-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                  aria-label="Remove address"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
