"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { BrowserMultiFormatReader, NotFoundException } from "@zxing/library";
import { Button } from "@/components/ui/button";

type BarcodeScannerProps = {
  onScan: (isbn: string) => void;
  onClose: () => void;
};

export function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(true);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>("");

  // Initialize reader and get cameras
  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;

    // Get available cameras
    reader
      .listVideoInputDevices()
      .then((devices) => {
        setCameras(devices);
        // Prefer back camera on mobile
        const backCamera = devices.find(
          (d) =>
            d.label.toLowerCase().includes("back") ||
            d.label.toLowerCase().includes("rear") ||
            d.label.toLowerCase().includes("environment")
        );
        setSelectedCamera(backCamera?.deviceId || devices[0]?.deviceId || "");
      })
      .catch((err) => {
        console.error("Failed to list cameras:", err);
        setError("Unable to access camera. Please check permissions.");
      });

    return () => {
      reader.reset();
    };
  }, []);

  // Start scanning when camera is selected
  useEffect(() => {
    if (!selectedCamera || !videoRef.current || !readerRef.current || !scanning) {
      return;
    }

    const reader = readerRef.current;
    let active = true;

    const startScanning = async () => {
      try {
        setError(null);
        await reader.decodeFromVideoDevice(
          selectedCamera,
          videoRef.current!,
          (result, err) => {
            if (!active) return;

            if (result) {
              const text = result.getText();
              // ISBN-13 starts with 978 or 979, ISBN-10 is 10 digits
              const isValidISBN =
                /^97[89]\d{10}$/.test(text) || /^\d{10}$/.test(text);

              if (isValidISBN) {
                setScanning(false);
                reader.reset();
                onScan(text);
              }
            }

            if (err && !(err instanceof NotFoundException)) {
              console.error("Scan error:", err);
            }
          }
        );
      } catch (err) {
        console.error("Failed to start scanning:", err);
        if (active) {
          setError("Failed to start camera. Please try again.");
        }
      }
    };

    startScanning();

    return () => {
      active = false;
      reader.reset();
    };
  }, [selectedCamera, scanning, onScan]);

  const switchCamera = useCallback(() => {
    if (cameras.length <= 1) return;
    const currentIndex = cameras.findIndex((c) => c.deviceId === selectedCamera);
    const nextIndex = (currentIndex + 1) % cameras.length;
    readerRef.current?.reset();
    setSelectedCamera(cameras[nextIndex].deviceId);
  }, [cameras, selectedCamera]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-black/80">
        <h2 className="text-white font-medium">Scan ISBN Barcode</h2>
        <Button variant="ghost" size="sm" onClick={onClose} className="text-white">
          Cancel
        </Button>
      </div>

      {/* Camera view */}
      <div className="flex-1 relative overflow-hidden">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          playsInline
          muted
        />

        {/* Scanning guide overlay */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative w-[280px] h-[120px]">
            {/* Corner brackets */}
            <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-white" />
            <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-white" />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-white" />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-white" />
            {/* Scanning line animation */}
            {scanning && (
              <div className="absolute top-1/2 left-4 right-4 h-0.5 bg-red-500 animate-pulse" />
            )}
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="absolute bottom-24 left-4 right-4 bg-red-500/90 text-white p-3 rounded-lg text-sm text-center">
            {error}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 bg-black/80 space-y-3">
        <p className="text-white/70 text-sm text-center">
          Point camera at the barcode on the back of the book
        </p>
        {cameras.length > 1 && (
          <Button
            variant="outline"
            onClick={switchCamera}
            className="w-full bg-white/10 border-white/20 text-white hover:bg-white/20"
          >
            Switch Camera
          </Button>
        )}
      </div>
    </div>
  );
}
