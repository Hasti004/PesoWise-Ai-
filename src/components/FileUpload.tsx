import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Upload, X, FileText, Image, Download, Camera } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useIsMobile } from "@/hooks/use-mobile";

interface Attachment {
  id: string;
  filename: string;
  content_type: string;
  file_url: string;
  created_at: string;
  file_size?: number; // File size in bytes
}

interface FileUploadProps {
  expenseId: string;
  lineItemId?: string;
  onUploadComplete?: (attachment: Attachment) => void;
  onUploadError?: (error: string) => void;
  className?: string;
  required?: boolean;
}

export function FileUpload({ 
  expenseId, 
  lineItemId, 
  onUploadComplete, 
  onUploadError,
  className,
  required = false
}: FileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { user, organizationId } = useAuth();
  const isMobile = useIsMobile();

  // Load existing attachments when expenseId is provided (not "new")
  useEffect(() => {
    const loadAttachments = async () => {
      if (expenseId && expenseId !== "new" && organizationId) {
        try {
          const { data, error } = await supabase
            .from('attachments')
            .select('*')
            .eq('expense_id', expenseId)
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false });
          
          if (error) {
            console.error('Error loading attachments:', error);
            return;
          }
          
          if (data && data.length > 0) {
            // Map data to include file_size (default to 0 if not available)
            const attachmentsWithSize = data.map((att) => ({
              ...att,
              file_size: att.file_size || 0
            }));
            setAttachments(attachmentsWithSize);
            console.log('✅ Loaded existing attachments:', attachmentsWithSize.length);
          }
        } catch (error) {
          console.error('Error fetching attachments:', error);
        }
      }
    };
    
    loadAttachments();
  }, [expenseId, organizationId]);


  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      await uploadFile(file);
    }
    
    // Reset input value to allow selecting the same file again
    if (event.target) {
      event.target.value = '';
    }
  };

  const handleCameraClick = () => {
    cameraInputRef.current?.click();
  };

  // Image compression removed as requested

  // PDF compression removed as requested

  const uploadFile = async (file: File) => {
    try {
      setUploading(true);
      setUploadProgress(0);
      
      // Calculate current total size of all attachments - 2MB combined limit
      const currentTotalSize = attachments.reduce((sum, att) => sum + (att.file_size || 0), 0);
      const maxTotalSize = 2 * 1024 * 1024; // 2MB total limit for all attachments combined
      
      // Check if adding this file would exceed total limit
      if (currentTotalSize + file.size > maxTotalSize) {
        const currentTotalMB = (currentTotalSize / (1024 * 1024)).toFixed(2);
        const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
        throw new Error(`Total size limit exceeded. Current total: ${currentTotalMB}MB, adding ${fileSizeMB}MB would exceed 2MB limit.`);
      }
      
      // Validate individual file size - 2MB max per file (combined total is 2MB)
      const maxIndividualSize = 2 * 1024 * 1024; // 2MB max per file
      
      if (file.size > maxIndividualSize) {
        throw new Error(`File size must be less than 2MB`);
      }

      // Allow PNG, JPG images and PDF files
      const allowedTypes = [
        'image/jpeg',
        'image/jpg', 
        'image/png',
        'application/pdf'
      ];

      if (!allowedTypes.includes(file.type)) {
        throw new Error("Only PNG, JPG image files and PDF files are allowed for bill uploads");
      }

      // Additional validation for file extensions
      const allowedExtensions = ['.png', '.jpg', '.jpeg', '.pdf'];
      const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
      if (!allowedExtensions.includes(fileExtension)) {
        throw new Error("Only PNG, JPG image files and PDF files are allowed for bill uploads");
      }

      // Use file as-is (no compression)
      const fileToUpload = file;

      // Create unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      
      // Handle case where expenseId is "new" or undefined
      const uploadPath = expenseId === "new" || !expenseId ? `temp/${user?.id}/${fileName}` : `${expenseId}/${fileName}`;

      // Upload file to Supabase Storage (use receipts bucket as primary)
      const bucketName = 'receipts';
      
      // Validate user is authenticated
      if (!user?.id) {
        throw new Error("You must be logged in to upload files");
      }
      
      console.log('📤 Uploading file:', {
        fileName: file.name,
        fileSize: fileToUpload.size,
        fileType: fileToUpload.type,
        uploadPath,
        expenseId,
        userId: user.id
      });
      
      setUploadProgress(30); // Show progress
      
      const uploadResult = await supabase.storage
        .from('receipts')
        .upload(uploadPath, fileToUpload, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadResult.error) {
        console.error('❌ Storage upload error:', uploadResult.error);
        console.error('Error details:', {
          message: uploadResult.error.message,
          statusCode: uploadResult.error.statusCode,
          error: uploadResult.error.error
        });
        throw new Error(`Failed to upload file: ${uploadResult.error.message}`);
      }
      
      console.log('✅ File uploaded successfully:', uploadResult.data);
      setUploadProgress(70);

      // Get public URL (use the same bucket that was used for upload)
      const { data: urlData } = supabase.storage
        .from(bucketName)
        .getPublicUrl(uploadPath);
      
      console.log('📎 Public URL generated:', urlData.publicUrl);
      setUploadProgress(85);

      // Save attachment record to database (only if expenseId is not "new")
      let attachmentData = null;
      if (expenseId !== "new" && expenseId) {
        // Use the expense row's organization_id so RLS (org match) succeeds even if
        // profiles vs membership org differ from AuthContext.
        let insertOrgId: string | null = organizationId ?? null;
        const { data: expenseRow } = await supabase
          .from("expenses")
          .select("organization_id")
          .eq("id", expenseId)
          .maybeSingle();
        if (expenseRow?.organization_id) {
          insertOrgId = expenseRow.organization_id;
        }
        if (!insertOrgId) {
          throw new Error("Organization not found");
        }
        
        console.log('💾 Saving attachment to database:', {
          expense_id: expenseId,
          organization_id: insertOrgId,
          filename: file.name
        });
        
        const { data, error: attachmentError } = await supabase
          .from('attachments')
          .insert({
            expense_id: expenseId,
            organization_id: insertOrgId,
            line_item_id: lineItemId,
            file_url: urlData.publicUrl,
            filename: file.name,
            content_type: file.type,
            uploaded_by: user?.id,
            file_size: file.size, // Store file size
          })
          .select()
          .single();
        
        if (attachmentError) {
          console.error('❌ Database insert error:', attachmentError);
          throw attachmentError;
        }
        attachmentData = data;
        console.log('✅ Attachment saved to database:', attachmentData);
      }
      
      setUploadProgress(100);

      // Create a temporary attachment object for new expenses
      const tempAttachment = {
        id: `temp-${Date.now()}`,
        filename: file.name,
        content_type: file.type,
        file_url: urlData.publicUrl,
        created_at: new Date().toISOString(),
        file_size: file.size
      };

      setAttachments(prev => [...prev, attachmentData || tempAttachment]);
      
      toast({
        title: "Upload successful",
        description: `${file.name} has been uploaded successfully`,
      });

      if (onUploadComplete) {
        onUploadComplete(attachmentData || tempAttachment);
      }
    } catch (error: any) {
      console.error("Upload error:", error);
      const errorMessage = error.message || "Failed to upload file";
      
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: errorMessage,
      });

      onUploadError?.(errorMessage);
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const deleteAttachment = async (attachmentId: string) => {
    try {
      const attachment = attachments.find(a => a.id === attachmentId);
      if (!attachment) return;

      console.log('🗑️ Deleting attachment:', {
        attachmentId,
        filename: attachment.filename,
        fileUrl: attachment.file_url
      });

      // Extract file path from URL
      // Handle both public URLs and paths
      let filePath = '';
      if (attachment.file_url.startsWith('http')) {
        const url = new URL(attachment.file_url);
        // Extract path after /storage/v1/object/public/receipts/
        const pathMatch = url.pathname.match(/\/storage\/v1\/object\/public\/receipts\/(.+)$/);
        if (pathMatch) {
          filePath = pathMatch[1];
        } else {
          // Fallback: try to extract from pathname
          const parts = url.pathname.split('/');
          const receiptsIndex = parts.indexOf('receipts');
          if (receiptsIndex !== -1 && receiptsIndex < parts.length - 1) {
            filePath = parts.slice(receiptsIndex + 1).join('/');
          }
        }
      } else {
        // If it's already a path
        filePath = attachment.file_url;
      }

      console.log('📁 Extracted file path:', filePath);

      // Delete from storage if filePath is valid
      if (filePath) {
        const { error: storageError } = await supabase.storage
          .from('receipts')
          .remove([filePath]);
        
        if (storageError) {
          console.error('⚠️ Storage delete error (continuing with DB delete):', storageError);
        } else {
          console.log('✅ File deleted from storage');
        }
      }

      // Delete from database (only if it's not a temp attachment)
      if (attachmentId && !attachmentId.startsWith('temp-')) {
        const { error: dbError } = await supabase
          .from('attachments')
          .delete()
          .eq('id', attachmentId);
        
        if (dbError) {
          console.error('❌ Database delete error:', dbError);
          throw dbError;
        }
        console.log('✅ Attachment deleted from database');
      }

      // Remove from local state
      setAttachments(prev => prev.filter(a => a.id !== attachmentId));
      
      toast({
        title: "File deleted",
        description: `${attachment.filename} has been deleted`,
      });
    } catch (error: any) {
      console.error("❌ Delete error:", error);
      toast({
        variant: "destructive",
        title: "Delete failed",
        description: error.message || "Failed to delete file",
      });
    }
  };

  const getFileIcon = (contentType: string) => {
    if (contentType.startsWith('image/')) {
      return <Image className="h-4 w-4" />;
    }
    if (contentType === 'application/pdf') {
      return <FileText className="h-4 w-4" />;
    }
    return <FileText className="h-4 w-4" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <>
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Receipt Attachments
        </CardTitle>
        <CardDescription>
          Upload receipts and supporting documents for your expenses
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Upload Area */}
        <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center">
          {/* Regular file input for desktop */}
                <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/jpg,application/pdf"
            onChange={handleFileSelect}
            className="hidden"
          />
          
          {/* Camera input for mobile */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileSelect}
            className="hidden"
          />
          
          <div className="space-y-2">
            <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
            <div className="flex flex-col sm:flex-row gap-2 justify-center items-center">
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full sm:w-auto"
              >
                <Upload className="h-4 w-4 mr-2" />
                Choose Files
              </Button>
              {isMobile && (
                <Button
                  variant="outline"
                  onClick={handleCameraClick}
                  disabled={uploading}
                  className="w-full sm:w-auto bg-blue-50 hover:bg-blue-100 border-blue-300"
                >
                  <Camera className="h-4 w-4 mr-2" />
                  Take Photo
                </Button>
              )}
            </div>
              <p className="text-sm text-muted-foreground mt-2">
              {isMobile ? "Take a photo or choose from files" : "or drag and drop bill photos/PDFs here"}
              </p>
              <p className="text-xs text-muted-foreground">
                PNG, JPG, PDF (max 2MB each) • Total limit: 2MB for all files combined
                {required && (
                  <span className="text-red-500 font-medium"> * Required for submission</span>
                )}
            </p>
          </div>

          {uploading && (
            <div className="mt-4 space-y-2">
              <Progress value={uploadProgress} className="w-full" />
              <p className="text-sm text-muted-foreground">Uploading...</p>
            </div>
          )}
        </div>

        {/* Attachments List */}
        {attachments.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Uploaded Files</h4>
              <p className="text-xs text-muted-foreground">
                Total: {formatFileSize(attachments.reduce((sum, att) => sum + (att.file_size || 0), 0))} / {formatFileSize(2 * 1024 * 1024)}
              </p>
            </div>
            <div className="space-y-2">
              {attachments.filter(attachment => attachment).map((attachment) => (
                <div
                  key={attachment.id || Math.random()}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    {getFileIcon(attachment.content_type || 'image/jpeg')}
                    <div>
                      <p className="font-medium text-sm">{attachment.filename || 'Unknown file'}</p>
                      <p className="text-xs text-muted-foreground">
                        {attachment.content_type || 'Unknown type'} • {attachment.file_size ? formatFileSize(attachment.file_size) : 'Unknown size'} • {(() => {
                          try {
                            return attachment.created_at ? format(new Date(attachment.created_at), "MMM d, yyyy") : 'Unknown date';
                          } catch {
                            return 'Invalid date';
                          }
                        })()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setImagePreviewUrl(attachment.file_url);
                        setImagePreviewOpen(true);
                      }}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteAttachment(attachment.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>

    {/* Image Preview Dialog */}
    <Dialog open={imagePreviewOpen} onOpenChange={setImagePreviewOpen}>
      <DialogContent className="max-w-3xl">
        {imagePreviewUrl && (
          imagePreviewUrl.toLowerCase().endsWith('.pdf') ? (
            <iframe src={imagePreviewUrl} className="w-full h-[600px] rounded" title="PDF Preview" />
          ) : (
            <img src={imagePreviewUrl} alt="Attachment preview" className="w-full h-auto rounded" />
          )
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}

