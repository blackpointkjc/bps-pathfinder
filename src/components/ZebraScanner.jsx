import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Scan, CheckCircle2, Upload, FileText, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function ZebraScanner({ onDataScanned, recordType = "person", user }) {
  const [scanBuffer, setScanBuffer] = useState("");
  const [lastScans, setLastScans] = useState([]);
  const [scanStatus, setScanStatus] = useState(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [showDebug, setShowDebug] = useState(false);
  const [focusCount, setFocusCount] = useState(0);
  
  const scanInputRef = useRef(null);
  const bufferRef = useRef("");
  const timeoutRef = useRef(null);
  const lastKeyTimeRef = useRef(Date.now());

  useEffect(() => {
    const maintainFocus = () => {
      if (scanInputRef.current && document.activeElement !== scanInputRef.current) {
        scanInputRef.current.focus();
        setFocusCount(prev => prev + 1);
      }
    };

    maintainFocus();
    const focusInterval = setInterval(maintainFocus, 500);

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        maintainFocus();
      }
    };

    const handleWindowFocus = () => {
      maintainFocus();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('click', maintainFocus);

    return () => {
      clearInterval(focusInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('click', maintainFocus);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const parseAAMVA = (data) => {
    const lines = data.split('\n').join('').split('\r').join('');
    const result = {};

    const extractField = (code) => {
      const regex = new RegExp(code + '([^\\n\\r@]+)');
      const match = lines.match(regex);
      return match ? match[1].trim() : null;
    };

    result.id_number = extractField('DAQ');
    result.last_name = extractField('DCS');
    result.first_name = extractField('DAC');
    result.middle_name = extractField('DAD');
    result.address = extractField('DAG');
    result.city = extractField('DAI');
    result.state = extractField('DAJ');
    result.zip_code = extractField('DAK');
    
    const dob = extractField('DBB');
    if (dob && dob.length === 8) {
      result.date_of_birth = `${dob.substring(4, 8)}-${dob.substring(0, 2)}-${dob.substring(2, 4)}`;
    }
    
    const exp = extractField('DBA');
    if (exp && exp.length === 8) {
      result.expiration_date = `${exp.substring(4, 8)}-${exp.substring(0, 2)}-${exp.substring(2, 4)}`;
    }

    const issue = extractField('DBD');
    if (issue && issue.length === 8) {
      result.issue_date = `${issue.substring(4, 8)}-${issue.substring(0, 2)}-${issue.substring(2, 4)}`;
    }

    const sex = extractField('DBC');
    if (sex) {
      result.sex = sex === '1' ? 'M' : sex === '2' ? 'F' : sex;
    }

    result.height = extractField('DAU');
    result.weight = extractField('DAW');
    result.eyes = extractField('DAY');
    result.hair = extractField('DAZ');

    result.full_name = [result.first_name, result.middle_name, result.last_name]
      .filter(Boolean).join(' ');

    return result;
  };

  const processScan = (data) => {
    if (!data || data.length < 10) return;

    const now = new Date();
    const isAAMVA = data.includes('@') && (data.includes('ANSI ') || data.includes('AAMVA'));
    
    let parsedData = null;
    let scanType = 'unknown';

    if (isAAMVA) {
      scanType = 'aamva_pdf417';
      parsedData = parseAAMVA(data);
    } else {
      scanType = 'registration_barcode';
      parsedData = {
        raw_value: data,
        plate_or_vin: data.substring(0, 20),
      };
    }

    const scanRecord = {
      type: scanType,
      raw: data.substring(0, 500),
      length: data.length,
      parsed: parsedData,
      timestamp: now.toISOString(),
      success: parsedData !== null
    };

    setLastScans(prev => [scanRecord, ...prev.slice(0, 2)]);

    if (parsedData) {
      setScanStatus({
        success: true,
        type: scanType,
        timestamp: now,
        scanned_by: user?.email || 'unknown'
      });

      onDataScanned({
        ...parsedData,
        _scan_metadata: {
          id_scanned_in_person: true,
          scan_type: scanType,
          scan_raw: data,
          scan_parsed_json: JSON.stringify(parsedData),
          scanned_at: now.toISOString(),
          scanned_by: user?.email || 'unknown',
          device_id: navigator.userAgent
        }
      });
    } else {
      setScanStatus({
        success: false,
        error: 'Could not parse scan data',
        timestamp: now
      });
    }

    bufferRef.current = "";
    setScanBuffer("");
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    const now = Date.now();
    const timeSinceLastKey = now - lastKeyTimeRef.current;
    lastKeyTimeRef.current = now;

    bufferRef.current = value;
    setScanBuffer(value);

    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    if (value.includes('\n') || value.includes('\r')) {
      processScan(value.replace(/[\n\r]/g, ''));
      bufferRef.current = "";
      setScanBuffer("");
      e.target.value = "";
      return;
    }

    if (value.length > 50) {
      timeoutRef.current = setTimeout(() => {
        if (bufferRef.current.length > 50) {
          processScan(bufferRef.current);
        }
      }, 100);
    }
  };

  const handleFileUpload = async (e, fileType) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingFile(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setUploadedFiles(prev => [...prev, {
        type: fileType,
        url: file_url,
        name: file.name,
        uploaded_at: new Date().toISOString()
      }]);
      
      onDataScanned({
        _attachments: {
          [fileType]: file_url,
          [`${fileType}_name`]: file.name
        }
      });
    } catch (error) {
      console.error("Error uploading file:", error);
      alert("Error uploading file. Please try again.");
    }
    setUploadingFile(false);
    e.target.value = '';
  };

  return (
    <Card className="border-2 border-blue-500 bg-gradient-to-br from-blue-50 to-indigo-50">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scan className="w-6 h-6 text-blue-600" />
            <span className="text-blue-900">Zebra Scanner - {recordType === 'person' ? 'ID/License' : 'Vehicle Registration'}</span>
          </div>
          {scanStatus?.success && (
            <Badge className="bg-green-600 flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" />
              ID Scanned
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <div className="bg-white border-4 border-blue-400 rounded-lg p-6 text-center">
            <div className="flex items-center justify-center mb-3">
              <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center animate-pulse">
                <Scan className="w-6 h-6 text-white" />
              </div>
            </div>
            <p className="text-xl font-bold text-blue-900 mb-2">READY TO SCAN</p>
            <p className="text-sm text-blue-700 mb-4">
              {recordType === 'person' 
                ? 'Scan the PDF417 barcode on the back of driver\'s license or ID card'
                : 'Scan barcode or QR code on vehicle registration'}
            </p>
            
            <input
              ref={scanInputRef}
              type="text"
              value={scanBuffer}
              onChange={handleInputChange}
              onBlur={(e) => {
                setTimeout(() => e.target.focus(), 10);
              }}
              className="w-full p-3 border-2 border-yellow-400 rounded bg-yellow-50 font-mono text-sm"
              placeholder="Scanner input appears here automatically..."
              autoFocus
              autoComplete="off"
            />
            
            {scanBuffer && (
              <div className="mt-2 text-xs text-blue-600">
                Receiving... {scanBuffer.length} characters
              </div>
            )}
          </div>
        </div>

        {scanStatus && (
          <div className={`p-4 rounded-lg border-2 ${scanStatus.success ? 'bg-green-50 border-green-500' : 'bg-red-50 border-red-500'}`}>
            <div className="flex items-center gap-2 mb-2">
              {scanStatus.success ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <span className="font-bold text-green-900">Scan Successful</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-5 h-5 text-red-600" />
                  <span className="font-bold text-red-900">Scan Failed</span>
                </>
              )}
            </div>
            {scanStatus.success && (
              <div className="text-sm text-green-800 space-y-1">
                <p>Type: <span className="font-semibold">{scanStatus.type}</span></p>
                <p>Time: <span className="font-semibold">{new Date(scanStatus.timestamp).toLocaleString()}</span></p>
                <p>Scanned by: <span className="font-semibold">{scanStatus.scanned_by}</span></p>
              </div>
            )}
            {scanStatus.error && (
              <p className="text-sm text-red-800">{scanStatus.error}</p>
            )}
          </div>
        )}

        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="id_photo" className="flex items-center gap-2">
                <Upload className="w-4 h-4" />
                Upload ID Photo
              </Label>
              <Input
                id="id_photo"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => handleFileUpload(e, 'id_photo')}
                disabled={uploadingFile}
                className="bg-white"
              />
            </div>
            
            {recordType === 'vehicle' && (
              <div className="space-y-2">
                <Label htmlFor="registration" className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Upload Registration
                </Label>
                <Input
                  id="registration"
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) => handleFileUpload(e, 'registration')}
                  disabled={uploadingFile}
                  className="bg-white"
                />
              </div>
            )}
          </div>

          {uploadedFiles.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-700">Uploaded Files:</p>
              {uploadedFiles.map((file, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2 bg-white rounded border">
                  <FileText className="w-4 h-4 text-blue-600" />
                  <span className="text-sm flex-1">{file.name}</span>
                  <Badge variant="outline">{file.type}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowDebug(!showDebug)}
          className="w-full"
        >
          {showDebug ? <ChevronUp className="w-4 h-4 mr-2" /> : <ChevronDown className="w-4 h-4 mr-2" />}
          {showDebug ? 'Hide' : 'Show'} Debug Info
        </Button>

        {showDebug && (
          <div className="bg-slate-900 text-green-400 p-4 rounded font-mono text-xs space-y-2">
            <p>Focus Count: {focusCount}</p>
            <p>Input Focused: {document.activeElement === scanInputRef.current ? '✓ YES' : '✗ NO'}</p>
            <p>Buffer Length: {scanBuffer.length}</p>
            
            <div className="border-t border-slate-700 pt-2 mt-2">
              <p className="text-white font-bold mb-2">Last 3 Scans:</p>
              {lastScans.length === 0 ? (
                <p className="text-slate-500">No scans yet</p>
              ) : (
                lastScans.map((scan, idx) => (
                  <div key={idx} className="mb-3 pb-3 border-b border-slate-700">
                    <p className="text-yellow-400">#{idx + 1} - {scan.type}</p>
                    <p>Length: {scan.length} | Success: {scan.success ? '✓' : '✗'}</p>
                    <p className="text-xs break-all mt-1">{scan.raw.substring(0, 100)}...</p>
                    {scan.parsed && (
                      <p className="text-xs text-blue-400 mt-1">
                        Parsed: {Object.keys(scan.parsed).length} fields
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}