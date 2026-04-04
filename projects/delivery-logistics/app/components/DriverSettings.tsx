'use client';

interface DriverSettingsProps {
  driverCount: number;
  driverNames: string[];
  depotAddress: string;
  onDriverCountChange: (count: number) => void;
  onDriverNamesChange: (names: string[]) => void;
  onDepotAddressChange: (address: string) => void;
}

export default function DriverSettings({
  driverCount,
  driverNames,
  depotAddress,
  onDriverCountChange,
  onDriverNamesChange,
  onDepotAddressChange,
}: DriverSettingsProps) {
  function handleCountChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1));
    onDriverCountChange(val);

    // Grow or shrink the names array
    const updated = Array.from({ length: val }, (_, i) =>
      driverNames[i] ?? `Driver ${i + 1}`
    );
    onDriverNamesChange(updated);
  }

  function updateName(index: number, name: string) {
    const updated = [...driverNames];
    updated[index] = name;
    onDriverNamesChange(updated);
  }

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-white">Driver Settings</h2>

      {/* Driver count slider + number */}
      <div className="space-y-2">
        <label className="text-sm text-slate-300">
          Number of drivers
          <span className="ml-2 text-green-400 font-semibold">{driverCount}</span>
        </label>
        <input
          type="range"
          min={1}
          max={10}
          value={driverCount}
          onChange={handleCountChange}
          className="w-full accent-green-500"
        />
        <div className="flex justify-between text-xs text-slate-600">
          <span>1</span>
          <span>10</span>
        </div>
      </div>

      {/* Driver name inputs */}
      <div className="space-y-2">
        <label className="text-sm text-slate-300">Driver names (optional)</label>
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: driverCount }, (_, i) => (
            <input
              key={i}
              type="text"
              value={driverNames[i] ?? `Driver ${i + 1}`}
              onChange={(e) => updateName(i, e.target.value)}
              placeholder={`Driver ${i + 1}`}
              className="px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-green-500"
            />
          ))}
        </div>
      </div>

      {/* Depot address */}
      <div className="space-y-2">
        <label className="text-sm text-slate-300">
          Starting depot address
          <span className="ml-1 text-slate-500 text-xs">(optional)</span>
        </label>
        <input
          type="text"
          value={depotAddress}
          onChange={(e) => onDepotAddressChange(e.target.value)}
          placeholder="e.g. Toa Payoh Hub, Singapore"
          className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-green-500"
        />
        <p className="text-xs text-slate-500">Where all drivers start their routes from.</p>
      </div>
    </div>
  );
}
