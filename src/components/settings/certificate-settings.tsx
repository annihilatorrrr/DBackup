"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  getCertificateInfo,
  uploadCertificate,
  regenerateCertificate,
} from "@/app/actions/certificate";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ShieldCheck,
  ShieldAlert,
  Upload,
  RefreshCw,
  Lock,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Fingerprint,
  FileKey,
  Info,
} from "lucide-react";
import type { CertificateInfo } from "@/services/certificate-service";

export function CertificateSettings() {
  const [certInfo, setCertInfo] = useState<CertificateInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const certFileRef = useRef<HTMLInputElement>(null);
  const keyFileRef = useRef<HTMLInputElement>(null);

  const loadCertInfo = async () => {
    const result = await getCertificateInfo();
    if (result.success && result.data) {
      setCertInfo(result.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    getCertificateInfo().then((result) => {
      if (cancelled) return;
      if (result.success && result.data) {
        setCertInfo(result.data);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const handleUpload = async () => {
    const certFile = certFileRef.current?.files?.[0];
    const keyFile = keyFileRef.current?.files?.[0];

    if (!certFile || !keyFile) {
      toast.error("Please select both a certificate and a private key file.");
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append("certificate", certFile);
    formData.append("privateKey", keyFile);

    const result = await uploadCertificate(formData);
    setUploading(false);

    if (result.success) {
      toast.success(result.message);
      setShowUploadDialog(false);
      loadCertInfo();
    } else {
      toast.error(result.error || "Upload failed");
    }
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    const result = await regenerateCertificate();
    setRegenerating(false);

    if (result.success) {
      toast.success(result.message);
      setShowRegenerateDialog(false);
      loadCertInfo();
    } else {
      toast.error(result.error || "Regeneration failed");
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            TLS Certificate
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-1/3" />
            <div className="h-4 bg-muted rounded w-1/2" />
            <div className="h-4 bg-muted rounded w-2/5" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const isExpiringSoon = certInfo?.daysRemaining !== undefined && certInfo.daysRemaining <= 30 && certInfo.daysRemaining > 0;
  const isExpired = certInfo?.daysRemaining !== undefined && certInfo.daysRemaining <= 0;

  return (
    <div className="space-y-4">
      {/* HTTPS Status */}
      {!certInfo?.isHttpsEnabled && (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>HTTPS Disabled</AlertTitle>
          <AlertDescription>
            HTTPS is disabled via <code className="text-xs">DISABLE_HTTPS=true</code>. All traffic is unencrypted.
            Remove this variable or set it to <code className="text-xs">false</code> to enable HTTPS.
          </AlertDescription>
        </Alert>
      )}

      {certInfo?.isHttpsEnabled && certInfo.exists && (
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>HTTPS Enabled</AlertTitle>
          <AlertDescription>
            All connections to DBackup are encrypted with TLS.
            {certInfo.isSelfSigned && " Using a self-signed certificate - browsers will show a security warning on first visit."}
          </AlertDescription>
        </Alert>
      )}

      {/* Certificate Info Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                TLS Certificate
              </CardTitle>
              <CardDescription>
                Manage the TLS certificate used for HTTPS connections
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowRegenerateDialog(true)}
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                Regenerate
              </Button>
              <Button
                size="sm"
                onClick={() => setShowUploadDialog(true)}
              >
                <Upload className="h-4 w-4 mr-1" />
                Upload Certificate
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!certInfo?.exists ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileKey className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium">No certificate found</p>
              <p className="text-sm mt-1">
                A self-signed certificate will be generated on next server start,
                or upload your own certificate.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Status Badges */}
              <div className="flex flex-wrap gap-2">
                {certInfo.isSelfSigned ? (
                  <Badge variant="secondary">Self-Signed</Badge>
                ) : (
                  <Badge variant="default">Custom Certificate</Badge>
                )}
                {isExpired ? (
                  <Badge variant="destructive">Expired</Badge>
                ) : isExpiringSoon ? (
                  <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                    Expires Soon
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                    Valid
                  </Badge>
                )}
              </div>

              {/* Expiry Warning */}
              {(isExpired || isExpiringSoon) && (
                <Alert variant={isExpired ? "destructive" : "default"}>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    {isExpired
                      ? "This certificate has expired. Upload a new certificate or regenerate a self-signed one."
                      : `This certificate expires in ${certInfo.daysRemaining} days. Consider renewing it soon.`}
                  </AlertDescription>
                </Alert>
              )}

              {/* Certificate Details Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <CertField
                  icon={<Info className="h-4 w-4" />}
                  label="Subject"
                  value={certInfo.subject}
                />
                <CertField
                  icon={<Info className="h-4 w-4" />}
                  label="Issuer"
                  value={certInfo.issuer}
                />
                <CertField
                  icon={<CheckCircle2 className="h-4 w-4" />}
                  label="Valid From"
                  value={certInfo.validFrom}
                />
                <CertField
                  icon={<Clock className="h-4 w-4" />}
                  label="Valid Until"
                  value={certInfo.validTo}
                  highlight={isExpired || isExpiringSoon}
                />
                <CertField
                  icon={<Fingerprint className="h-4 w-4" />}
                  label="SHA-256 Fingerprint"
                  value={certInfo.fingerprint}
                  mono
                  className="md:col-span-2"
                />
                <CertField
                  icon={<FileKey className="h-4 w-4" />}
                  label="Serial Number"
                  value={certInfo.serialNumber}
                  mono
                />
                <CertField
                  icon={<Clock className="h-4 w-4" />}
                  label="Days Remaining"
                  value={`${certInfo.daysRemaining} days`}
                  highlight={isExpired || isExpiringSoon}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Restart Notice */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Changes to the TLS certificate require a restart of DBackup to take effect.
        </AlertDescription>
      </Alert>

      {/* Upload Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload TLS Certificate
            </DialogTitle>
            <DialogDescription>
              Upload a PEM-encoded certificate and private key. The certificate
              and key will be validated before saving.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cert-file">Certificate (.crt / .pem)</Label>
              <Input
                id="cert-file"
                type="file"
                accept=".crt,.pem,.cer"
                ref={certFileRef}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="key-file">Private Key (.key / .pem)</Label>
              <Input
                id="key-file"
                type="file"
                accept=".key,.pem"
                ref={keyFileRef}
              />
            </div>
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                The private key must match the certificate. Both files must be in PEM format.
                A restart is required after uploading.
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUploadDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={uploading}>
              {uploading ? "Validating & Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Regenerate Dialog */}
      <Dialog open={showRegenerateDialog} onOpenChange={setShowRegenerateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Regenerate Self-Signed Certificate
            </DialogTitle>
            <DialogDescription>
              This will replace the current certificate with a new self-signed certificate
              valid for 365 days.
            </DialogDescription>
          </DialogHeader>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Warning</AlertTitle>
            <AlertDescription>
              The current certificate will be permanently replaced. If you uploaded a custom
              certificate, it will be lost. A restart is required to apply the new certificate.
            </AlertDescription>
          </Alert>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRegenerateDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRegenerate} disabled={regenerating}>
              {regenerating ? "Generating..." : "Regenerate Certificate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Reusable certificate field display */
function CertField({
  icon,
  label,
  value,
  mono,
  highlight,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <div className={`space-y-1 ${className || ""}`}>
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {icon}
        {label}
      </div>
      <p
        className={`text-sm ${mono ? "font-mono text-xs break-all" : ""} ${
          highlight ? "text-amber-600 dark:text-amber-400 font-medium" : ""
        }`}
      >
        {value || "-"}
      </p>
    </div>
  );
}
