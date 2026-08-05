import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Camera, Upload, Loader2, Scan, X, Video } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function IDScanner({ onDataExtracted, onClose }) {
  const [scanning, setScanning] = useState(false);
  const [idImageUrl, setIdImageUrl] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [scanningBarcode, setScanningBarcode] = useState(false);
  const [hardwareScannerActive, setHardwareScannerActive] = useState(false);
  const [scannedData, setScannedData] = useState("");
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanInputRef = useRef(null);
  const scanBufferRef = useRef("");

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (hardwareScannerActive && scanInputRef.current) {
      scanInputRef.current.focus();
    }
  }, [hardwareScannerActive]);

  const processScannedBarcode = async (barcodeData) => {
    setScanning(true);
    setScannedData(barcodeData);
    
    try {
      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `Parse this PDF417 barcode data from a US driver's license or ID card. The data is encoded with special delimiters.

Barcode data:
${barcodeData}

Extract all fields following AAMVA DL/ID Card Design Standard. Common field codes:
- DAA/DAC/DAD = Full Name (Last, First, Middle)
- DAG = Street Address
- DAI = City
- DAJ = State
- DAK = Zip Code
- DBB = Date of Birth (MMDDYYYY or YYYYMMDD)
- DAQ = License/ID Number
- DBA = Expiration Date
- DBC = Sex (1=M, 2=F)
- DAU = Height (format varies)
- DAW = Weight
- DAY = Eye Color
- DAZ = Hair Color

Return structured JSON with standardized field names. Convert dates to YYYY-MM-DD format.`,
        response_json_schema: {
          type: "object",
          properties: {
            full_name: { type: "string" },
            first_name: { type: "string" },
            last_name: { type: "string" },
            middle_name: { type: "string" },
            address: { type: "string" },
            city: { type: "string" },
            state: { type: "string" },
            zip_code: { type: "string" },
            date_of_birth: { type: "string" },
            id_number: { type: "string" },
            expiration_date: { type: "string" },
            sex: { type: "string" },
            height: { type: "string" },
            weight: { type: "string" },
            eyes: { type: "string" },
            hair: { type: "string" },
            race: { type: "string" },
          }
        }
      });

      if (response) {
        setHardwareScannerActive(false);
        onDataExtracted(response);
        alert("✅ ID barcode scanned successfully! Form fields have been filled.");
      } else {
        alert("Could not parse barcode data. Please try scanning again.");
      }
    } catch (error) {
      console.error("Error processing barcode:", error);
      alert("Error processing barcode data. Please try again.");
    }
    setScanning(false);
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingImage(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setIdImageUrl(file_url);
    } catch (error) {
      console.error("Error uploading ID image:", error);
      alert("Error uploading image. Please try again.");
    }
    setUploadingImage(false);
  };

  const startCamera = async () => {
    try {
      // Optimized for Zebra TC510K mobile computer - use rear camera with high resolution
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment',
          width: { ideal: 3840, min: 1920 },
          height: { ideal: 2160, min: 1080 },
          focusMode: 'continuous',
          frameRate: { ideal: 30 }
        }
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setCameraActive(true);
      }
    } catch (error) {
      console.error("Error accessing camera:", error);
      alert("Could not access camera. Please check permissions and try again.");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  const captureAndScanBarcode = async () => {
    if (!videoRef.current) return;

    setScanningBarcode(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoRef.current, 0, 0);
      
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95));
      const file = new File([blob], 'barcode-scan.jpg', { type: 'image/jpeg' });
      
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      
      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `Extract all information from the barcode on this ID/driver's license. This is typically a PDF417 barcode on the back of the ID.

Read the barcode and extract:
- Full name
- First name, middle name, last name
- Address (street, city, state, zip)
- Date of birth (YYYY-MM-DD format)
- ID/License number
- Expiration date
- Sex/Gender
- Height
- Weight
- Eye color
- Hair color
- Any other encoded information

Return structured JSON with all available fields. If the barcode is not readable, try to extract information from the text on the ID card itself.`,
        file_urls: [file_url],
        response_json_schema: {
          type: "object",
          properties: {
            full_name: { type: "string" },
            first_name: { type: "string" },
            last_name: { type: "string" },
            middle_name: { type: "string" },
            address: { type: "string" },
            city: { type: "string" },
            state: { type: "string" },
            zip_code: { type: "string" },
            date_of_birth: { type: "string" },
            id_number: { type: "string" },
            expiration_date: { type: "string" },
            sex: { type: "string" },
            height: { type: "string" },
            weight: { type: "string" },
            eyes: { type: "string" },
            hair: { type: "string" },
            race: { type: "string" },
          }
        }
      });

      if (response) {
        stopCamera();
        onDataExtracted(response);
        alert("✅ Barcode scanned successfully! Form fields have been filled.");
      } else {
        alert("Could not read barcode. Please try again or use photo upload.");
      }
    } catch (error) {
      console.error("Error scanning barcode:", error);
      alert("Error scanning barcode. Please try again.");
    }
    setScanningBarcode(false);
  };

  const handleScanID = async () => {
    if (!idImageUrl) {
      alert("Please upload an ID image first.");
      return;
    }

    setScanning(true);
    try {
      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `Extract all readable information from this ID/driver's license image. Return structured data in JSON format.

Extract the following fields if visible:
- full_name (full name as shown)
- first_name
- last_name
- middle_name
- address (street address)
- city
- state
- zip_code
- date_of_birth (in YYYY-MM-DD format)
- id_number (driver's license number or ID number)
- expiration_date (in YYYY-MM-DD format if shown)
- sex (M/F or male/female)
- height (e.g., "5'10" or "5-10" or "510")
- weight (in pounds)
- eyes (eye color)
- hair (hair color)
- race (if shown)

Return a JSON object with these exact field names. If a field is not visible or readable, set it to null.`,
        file_urls: [idImageUrl],
        response_json_schema: {
          type: "object",
          properties: {
            full_name: { type: "string" },
            first_name: { type: "string" },
            last_name: { type: "string" },
            middle_name: { type: "string" },
            address: { type: "string" },
            city: { type: "string" },
            state: { type: "string" },
            zip_code: { type: "string" },
            date_of_birth: { type: "string" },
            id_number: { type: "string" },
            expiration_date: { type: "string" },
            sex: { type: "string" },
            height: { type: "string" },
            weight: { type: "string" },
            eyes: { type: "string" },
            hair: { type: "string" },
            race: { type: "string" },
          }
        }
      });

      if (response) {
        onDataExtracted(response);
        alert("✅ ID scanned successfully! Form fields have been filled.");
      } else {
        alert("Could not extract data from the ID image. Please try again or enter manually.");
      }
    } catch (error) {
      console.error("Error scanning ID:", error);
      alert("Error scanning ID. Please try again or enter information manually.");
    }
    setScanning(false);
  };

  return (
    <Card className="border-2 border-blue-300 bg-blue-50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-blue-900">
            <Scan className="w-5 h-5" />
            Scan ID/Driver's License
          </CardTitle>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="border-2 border-green-400 bg-green-50 rounded-lg p-4 mb-4">
          <p className="text-sm font-semibold text-green-900 mb-3 text-center flex items-center justify-center gap-2">
            <Scan className="w-5 h-5" />
            Hardware Barcode Scanner (Recommended)
          </p>
          
          {!hardwareScannerActive ? (
            <div className="space-y-2">
              <Button
                type="button"
                onClick={() => setHardwareScannerActive(true)}
                className="w-full bg-green-600 hover:bg-green-700 h-12 text-base"
              >
                <Scan className="w-5 h-5 mr-2" />
                Activate Scanner Device
              </Button>
              <p className="text-xs text-green-800 text-center">
                For devices with attached barcode scanners
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-white rounded-lg border-2 border-green-500 p-4">
                <div className="flex items-center justify-center mb-2">
                  <Loader2 className="w-6 h-6 animate-spin text-green-600 mr-2" />
                  <p className="text-green-900 font-semibold">Scanner Ready</p>
                </div>
                <p className="text-sm text-green-800 text-center mb-2">
                  Scan the PDF417 barcode on the back of the ID card now
                </p>
                <textarea
                  ref={scanInputRef}
                  value={scannedData}
                  onChange={(e) => {
                    const value = e.target.value;
                    setScannedData(value);
                    if (value.length > 50) {
                      processScannedBarcode(value);
                      setScannedData("");
                      e.target.value = "";
                    }
                  }}
                  onPaste={(e) => {
                    const value = e.clipboardData.getData('text');
                    if (value.length > 50) {
                      e.preventDefault();
                      processScannedBarcode(value);
                      setScannedData("");
                    }
                  }}
                  placeholder="Scanner input will appear here..."
                  className="w-full p-3 bg-yellow-50 rounded border-2 border-yellow-300 min-h-[80px] font-mono text-xs"
                  autoFocus
                />
                <p className="text-xs text-green-700 mt-2 text-center">
                  {scannedData ? `Receiving... (${scannedData.length} characters)` : 'Click here and scan the barcode'}
                </p>
              </div>
              <Button
                type="button"
                onClick={() => {
                  setHardwareScannerActive(false);
                  setScannedData("");
                  scanBufferRef.current = "";
                }}
                variant="outline"
                className="w-full border-red-300 text-red-700 hover:bg-red-50"
              >
                <X className="w-4 h-4 mr-2" />
                Cancel Scanner
              </Button>
            </div>
          )}
        </div>

        <div className="border-t border-blue-200 pt-4">
          <p className="text-sm font-medium text-blue-900 mb-3 text-center">Alternative: Photo Upload</p>
          <div className="space-y-2">
            <Label htmlFor="id_image">Upload ID Image</Label>
            <div className="flex gap-2">
              <Input
                id="id_image"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleImageUpload}
                disabled={uploadingImage || scanning || hardwareScannerActive}
                className="flex-1 bg-white"
              />
              {uploadingImage && <Loader2 className="w-5 h-5 animate-spin text-blue-600" />}
            </div>
            <p className="text-xs text-blue-700">
              Take a photo or upload an image of the driver's license or ID card
            </p>
          </div>
        </div>

        {idImageUrl && (
          <div className="bg-white rounded-lg border border-blue-200 p-3">
            <img
              src={idImageUrl}
              alt="ID preview"
              className="w-full max-h-64 object-contain rounded"
            />
          </div>
        )}

        {idImageUrl && (
          <Button
            onClick={handleScanID}
            disabled={!idImageUrl || scanning || hardwareScannerActive}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            {scanning ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Scanning ID...
              </>
            ) : (
              <>
                <Scan className="w-4 h-4 mr-2" />
                Scan & Auto-Fill Form
              </>
            )}
          </Button>
        )}

        <div className="border-t border-blue-200 pt-4 mt-4">
        <p className="text-sm font-semibold text-blue-900 mb-3 text-center flex items-center justify-center gap-2">
          <Scan className="w-4 h-4" />
          Live Barcode Scanner (Zebra TC510K)
        </p>

        {!cameraActive ? (
          <Button
            type="button"
            onClick={startCamera}
            variant="outline"
            className="w-full bg-white border-blue-300 text-blue-700 hover:bg-blue-50 h-12 text-base"
          >
            <Video className="w-5 h-5 mr-2" />
            Activate Camera Scanner
          </Button>
        ) : (
          <div className="space-y-3">
            <div className="bg-black rounded-lg overflow-hidden relative">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full h-80 object-cover"
              />
              <div className="absolute inset-0 border-4 border-red-500 opacity-50 pointer-events-none">
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-4/5 h-32 border-2 border-red-400"></div>
              </div>
            </div>

            <div className="bg-yellow-50 border border-yellow-300 rounded p-2">
              <p className="text-xs text-yellow-900 text-center font-medium">
                📷 Position the PDF417 barcode (back of ID) within the red guide box
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                onClick={captureAndScanBarcode}
                disabled={scanningBarcode}
                className="bg-green-600 hover:bg-green-700 h-12 text-base"
              >
                {scanningBarcode ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Reading...
                  </>
                ) : (
                  <>
                    <Scan className="w-5 h-5 mr-2" />
                    Scan Now
                  </>
                )}
              </Button>
              <Button
                type="button"
                onClick={stopCamera}
                variant="outline"
                className="border-red-300 text-red-700 hover:bg-red-50 h-12 text-base"
              >
                <X className="w-5 h-5 mr-2" />
                Close
              </Button>
            </div>
          </div>
        )}
        </div>
      </CardContent>
    </Card>
  );
}