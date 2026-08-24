import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Camera, Loader2, Scan, Upload, Video, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { uploadInternalFile } from '@/lib/internalUpload';

const clean = (value) => (value || "").replace(/\u0000/g, "").trim();

const formatDate = (value) => {
  const digits = clean(value).replace(/\D/g, "");
  if (digits.length !== 8) return clean(value);
  const yearFirst = Number(digits.slice(0, 4)) > 1900;
  const year = yearFirst ? digits.slice(0, 4) : digits.slice(4, 8);
  const month = yearFirst ? digits.slice(4, 6) : digits.slice(0, 2);
  const day = yearFirst ? digits.slice(6, 8) : digits.slice(2, 4);
  return `${year}-${month}-${day}`;
};

const normalizeSex = (value) => {
  const sex = clean(value).toUpperCase();
  if (["1", "M", "MALE"].includes(sex)) return "male";
  if (["2", "F", "FEMALE"].includes(sex)) return "female";
  return sex ? "unknown" : "";
};

const normalizeHeight = (value) => {
  const text = clean(value).toUpperCase();
  const inches = text.match(/(\d{2,3})\s*IN/)?.[1];
  if (inches) {
    const total = Number(inches);
    return `${Math.floor(total / 12)}-${total % 12}`;
  }
  const cm = text.match(/(\d{3})\s*CM/)?.[1];
  if (cm) {
    const total = Math.round(Number(cm) / 2.54);
    return `${Math.floor(total / 12)}-${total % 12}`;
  }
  return text;
};

const parseAamva = (raw) => {
  const text = String(raw || "").replace(/\r/g, "\n");
  const get = (...codes) => {
    for (const code of codes) {
      const match = text.match(new RegExp(`${code}([^\\n\\r]+)`, "i"));
      if (match) return clean(match[1]);
    }
    return "";
  };

  const lastName = get("DCS", "DAB");
  const firstName = get("DAC", "DCT", "DAD");
  const middleName = get("DAD");
  const fullName = [firstName, middleName, lastName].filter(Boolean).join(" ") || get("DAA");

  return {
    full_name: fullName,
    first_name: firstName,
    middle_name: middleName,
    last_name: lastName,
    address: get("DAG"),
    city: get("DAI"),
    state: get("DAJ"),
    zip_code: get("DAK").slice(0, 10),
    date_of_birth: formatDate(get("DBB")),
    id_number: get("DAQ"),
    expiration_date: formatDate(get("DBA")),
    issue_date: formatDate(get("DBD")),
    sex: normalizeSex(get("DBC")),
    height: normalizeHeight(get("DAU")),
    weight: get("DAW", "DAX").replace(/\D/g, ""),
    eyes: get("DAY"),
    hair: get("DAZ"),
    race: get("DCL"),
    document_discriminator: get("DCF"),
    raw_scan: raw,
    scan_type: "aamva_pdf417",
  };
};

export default function IDScanner({ onDataExtracted, onClose }) {
  const [busy, setBusy] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [hardwareActive, setHardwareActive] = useState(false);
  const [scannerText, setScannerText] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [message, setMessage] = useState("");
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const inputRef = useRef(null);
  const detectorRef = useRef(null);
  const timerRef = useRef(null);

  const stopCamera = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
  };

  useEffect(() => () => stopCamera(), []);
  useEffect(() => {
    if (hardwareActive) inputRef.current?.focus();
  }, [hardwareActive]);

  const finish = (data, source) => {
    const enriched = {
      ...data,
      scan_source: source,
      scanned_at: new Date().toISOString(),
      device_id: navigator.userAgent,
    };
    onDataExtracted(enriched);
    setMessage("ID read successfully. The form has been filled.");
    setHardwareActive(false);
    stopCamera();
  };

  const processBarcode = async (raw, source = "barcode") => {
    if (!raw || busy) return;
    setBusy(true);
    try {
      const parsed = parseAamva(raw);
      if (parsed.first_name || parsed.last_name || parsed.id_number) {
        finish(parsed, source);
        return;
      }

      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `Parse this AAMVA PDF417 driver license payload. Return only the requested structured fields. Raw payload:\n${raw}`,
        response_json_schema: {
          type: "object",
          properties: {
            full_name: { type: "string" }, first_name: { type: "string" }, middle_name: { type: "string" }, last_name: { type: "string" },
            address: { type: "string" }, city: { type: "string" }, state: { type: "string" }, zip_code: { type: "string" },
            date_of_birth: { type: "string" }, id_number: { type: "string" }, expiration_date: { type: "string" },
            sex: { type: "string" }, height: { type: "string" }, weight: { type: "string" }, eyes: { type: "string" }, hair: { type: "string" }, race: { type: "string" }
          }
        }
      });
      finish({ ...response, raw_scan: raw, scan_type: "aamva_pdf417" }, source);
    } catch (error) {
      console.error(error);
      setMessage("The barcode could not be read. Try the camera again or take a clear photo of the front of the ID.");
    } finally {
      setBusy(false);
    }
  };

  const scanVideoFrame = async () => {
    if (!detectorRef.current || !videoRef.current || videoRef.current.readyState < 2 || busy) return;
    try {
      const results = await detectorRef.current.detect(videoRef.current);
      const hit = results.find((item) => item.rawValue);
      if (hit) await processBarcode(hit.rawValue, "camera_barcode");
    } catch (error) {
      console.debug("Barcode frame not readable yet", error);
    }
  };

  const startCamera = async () => {
    setMessage("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);

      if ("BarcodeDetector" in window) {
        const supported = await window.BarcodeDetector.getSupportedFormats();
        const formats = supported.includes("pdf417") ? ["pdf417"] : supported;
        detectorRef.current = new window.BarcodeDetector({ formats });
        timerRef.current = window.setInterval(scanVideoFrame, 650);
        setMessage("Camera is scanning continuously. Hold the PDF417 barcode inside the guide.");
      } else {
        setMessage("Automatic barcode detection is not supported on this device. Use Capture & Read below.");
      }
    } catch (error) {
      console.error(error);
      setMessage("Camera access failed. Allow camera permission in the browser, then try again.");
    }
  };

  const uploadAndReadImage = async (file, source) => {
    if (!file) return;
    setBusy(true);
    try {
      const { file_url } = await uploadInternalFile(file);
      setImageUrl(file_url);
      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `Read this US driver's license or identification card. Extract the exact legal name, address, date of birth, license/ID number, expiration date, sex, height, weight, eye color, hair color, and race when visible. Dates must be YYYY-MM-DD. Return null for unreadable fields.`,
        file_urls: [file_url],
        response_json_schema: {
          type: "object",
          properties: {
            full_name: { type: "string" }, first_name: { type: "string" }, middle_name: { type: "string" }, last_name: { type: "string" },
            address: { type: "string" }, city: { type: "string" }, state: { type: "string" }, zip_code: { type: "string" },
            date_of_birth: { type: "string" }, id_number: { type: "string" }, expiration_date: { type: "string" },
            sex: { type: "string" }, height: { type: "string" }, weight: { type: "string" }, eyes: { type: "string" }, hair: { type: "string" }, race: { type: "string" }
          }
        }
      });
      finish({ ...response, id_photo: file_url, scan_type: "id_image_ocr" }, source);
    } catch (error) {
      console.error(error);
      setMessage("The ID image could not be read. Retake the photo in good light with all four corners visible.");
    } finally {
      setBusy(false);
    }
  };

  const captureFrame = async () => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext("2d").drawImage(videoRef.current, 0, 0);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
    await uploadAndReadImage(new File([blob], "id-camera.jpg", { type: "image/jpeg" }), "camera_photo");
  };

  return (
    <Card className="border-2 border-blue-300 bg-blue-50">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-blue-900"><Scan className="h-5 w-5" />Scan ID or Driver's License</CardTitle>
          {onClose && <Button type="button" variant="ghost" size="sm" onClick={() => { stopCamera(); onClose(); }}><X className="h-4 w-4" /></Button>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-blue-200 bg-white p-4 space-y-3">
          <Button type="button" className="w-full h-12" onClick={cameraActive ? stopCamera : startCamera} disabled={busy}>
            <Video className="mr-2 h-5 w-5" />{cameraActive ? "Close Camera" : "Open Camera Scanner"}
          </Button>
          {cameraActive && (
            <div className="space-y-3">
              <div className="relative overflow-hidden rounded-lg bg-black">
                <video ref={videoRef} autoPlay playsInline muted className="h-72 w-full object-cover" />
                <div className="pointer-events-none absolute inset-x-[8%] top-1/2 h-28 -translate-y-1/2 rounded border-2 border-red-400" />
              </div>
              <Button type="button" variant="outline" className="w-full" onClick={captureFrame} disabled={busy}>
                <Camera className="mr-2 h-4 w-4" />Capture & Read ID
              </Button>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-green-300 bg-green-50 p-4 space-y-3">
          <Button type="button" variant="outline" className="w-full border-green-400" onClick={() => setHardwareActive((value) => !value)} disabled={busy}>
            <Scan className="mr-2 h-4 w-4" />{hardwareActive ? "Close Hardware Scanner" : "Use Zebra / USB Scanner"}
          </Button>
          {hardwareActive && (
            <textarea
              ref={inputRef}
              value={scannerText}
              onChange={(event) => {
                const value = event.target.value;
                setScannerText(value);
                if (value.length > 60 && /(ANSI|AAMVA|DAQ|DCS|DAC)/i.test(value)) {
                  processBarcode(value, "hardware_barcode");
                  setScannerText("");
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && scannerText.length > 20) {
                  event.preventDefault();
                  processBarcode(scannerText, "hardware_barcode");
                  setScannerText("");
                }
              }}
              className="min-h-24 w-full rounded-md border-2 border-green-400 bg-white p-3 font-mono text-xs"
              placeholder="Click here, then scan the PDF417 barcode on the back of the ID."
              autoFocus
            />
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="id-photo-upload" className="flex items-center gap-2"><Upload className="h-4 w-4" />Take or Upload ID Photo</Label>
          <Input id="id-photo-upload" type="file" accept="image/*" capture="environment" onChange={(event) => uploadAndReadImage(event.target.files?.[0], "photo_upload")} disabled={busy} className="bg-white" />
          {imageUrl && <img src={imageUrl} alt="Scanned ID preview" className="max-h-52 w-full rounded-md border bg-white object-contain" />}
        </div>

        {busy && <div className="flex items-center justify-center gap-2 text-sm text-blue-800"><Loader2 className="h-4 w-4 animate-spin" />Reading identification...</div>}
        {message && <p className="rounded-md bg-white p-3 text-sm text-blue-900" role="status">{message}</p>}
      </CardContent>
    </Card>
  );
}
