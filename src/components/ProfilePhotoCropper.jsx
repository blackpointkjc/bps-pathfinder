import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Crop, Loader2, Move, RotateCcw, ZoomIn } from "lucide-react";

const OUTPUT_SIZE = 420;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function dataUrlToFile(dataUrl, filename = "profile-photo.jpg") {
  const [header, body] = dataUrl.split(",");
  const mime = header.match(/data:(.*?);/)?.[1] || "image/jpeg";
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new File([bytes], filename, { type: mime });
}

export default function ProfilePhotoCropper({ open, imageFile, onClose, onSave, saving = false }) {
  const viewportRef = useRef(null);
  const dragRef = useRef(null);
  const [source, setSource] = useState("");
  const [imageSize, setImageSize] = useState({ width: 1, height: 1 });
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!imageFile) return undefined;
    const url = URL.createObjectURL(imageFile);
    setSource(url);
    setZoom(1);
    setPosition({ x: 0, y: 0 });
    loadImage(url).then((image) => setImageSize({ width: image.naturalWidth, height: image.naturalHeight })).catch(() => {});
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const baseScale = useMemo(() => {
    const viewport = 320;
    return Math.max(viewport / imageSize.width, viewport / imageSize.height);
  }, [imageSize]);

  const displayed = useMemo(() => ({
    width: imageSize.width * baseScale * zoom,
    height: imageSize.height * baseScale * zoom,
  }), [imageSize, baseScale, zoom]);

  const clampPosition = (next, dimensions = displayed) => {
    const maxX = Math.max(0, (dimensions.width - 320) / 2);
    const maxY = Math.max(0, (dimensions.height - 320) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, next.x)),
      y: Math.max(-maxY, Math.min(maxY, next.y)),
    };
  };

  useEffect(() => {
    setPosition((current) => clampPosition(current));
  }, [displayed.width, displayed.height]);

  const beginDrag = (event) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = { startX: event.clientX, startY: event.clientY, originX: position.x, originY: position.y };
  };

  const moveDrag = (event) => {
    if (!dragRef.current) return;
    setPosition(clampPosition({
      x: dragRef.current.originX + event.clientX - dragRef.current.startX,
      y: dragRef.current.originY + event.clientY - dragRef.current.startY,
    }));
  };

  const endDrag = () => { dragRef.current = null; };

  const reset = () => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  };

  const saveCrop = async () => {
    if (!source || !viewportRef.current) return;
    const image = await loadImage(source);
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const context = canvas.getContext("2d");
    const scaleToOutput = OUTPUT_SIZE / 320;
    const drawWidth = displayed.width * scaleToOutput;
    const drawHeight = displayed.height * scaleToOutput;
    const drawX = (160 - displayed.width / 2 + position.x) * scaleToOutput;
    const drawY = (160 - displayed.height / 2 + position.y) * scaleToOutput;
    context.fillStyle = "#0b1420";
    context.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
    await onSave({ dataUrl, file: dataUrlToFile(dataUrl) });
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && !saving && onClose()}>
      <DialogContent className="max-w-lg border-slate-700 bg-[#0d1826] text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Crop className="h-5 w-5 text-blue-400" />Adjust Profile Photo</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="rounded-lg border border-slate-700 bg-[#07111f] p-4">
            <div
              ref={viewportRef}
              className="relative mx-auto h-80 w-80 max-w-full touch-none cursor-grab overflow-hidden rounded-full border-4 border-blue-400/70 bg-slate-950 active:cursor-grabbing"
              onPointerDown={beginDrag}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              {source && (
                <img
                  src={source}
                  alt="Crop preview"
                  draggable="false"
                  className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
                  style={{
                    width: displayed.width,
                    height: displayed.height,
                    transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px))`,
                  }}
                />
              )}
              <div className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-white/30" />
            </div>
            <div className="mt-3 flex items-center justify-center gap-2 text-xs text-slate-400"><Move className="h-3.5 w-3.5" />Drag the photo to reposition it</div>
          </div>

          <div className="space-y-2 rounded-lg border border-slate-700 bg-[#111e2d] p-4">
            <div className="flex items-center justify-between text-sm text-slate-300"><span className="flex items-center gap-2"><ZoomIn className="h-4 w-4" />Zoom</span><span>{Math.round(zoom * 100)}%</span></div>
            <Slider value={[zoom]} min={1} max={3} step={0.01} onValueChange={([value]) => setZoom(value)} />
          </div>

          <div className="flex flex-wrap justify-between gap-2">
            <Button type="button" variant="outline" onClick={reset} disabled={saving} className="border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700"><RotateCcw className="mr-2 h-4 w-4" />Reset</Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={saving} className="border-slate-600 bg-transparent text-slate-200">Cancel</Button>
              <Button type="button" onClick={saveCrop} disabled={saving || !source} className="bg-blue-700 hover:bg-blue-600">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Crop className="mr-2 h-4 w-4" />}
                {saving ? "Saving..." : "Crop & Save"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
