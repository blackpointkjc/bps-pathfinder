import { createClientFromRequest } from 'npm:@base44/sdk';

function isSafeFileUrl(raw: string) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (host === 'localhost' || host.endsWith('.localhost') || host === '::1') return false;
    // Block loopback, private, link-local, and cloud metadata IP ranges (SSRF guard).
    if (/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|169\.254\.|0\.)/.test(host)) return false;
    if (/^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./.test(host)) return false;
    if (/^(fe80|fc|fd)/.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { fileUrl } = await req.json();

    if (!fileUrl) {
      return Response.json({ error: 'No file URL provided' }, { status: 400 });
    }

    if (!isSafeFileUrl(fileUrl)) {
      return Response.json({ error: 'Invalid or blocked file URL' }, { status: 400 });
    }

    // Download the PPTX file
    const fileResponse = await fetch(fileUrl);
    const fileBlob = await fileResponse.blob();

    // Use CloudConvert API to convert PPTX to PNG images
    const apiKey = Deno.env.has('CLOUDCONVERT_API_KEY') ? Deno.env.get('CLOUDCONVERT_API_KEY') : null;
    
    if (!apiKey) {
      return Response.json({
        error: 'CloudConvert API key not configured. Please set CLOUDCONVERT_API_KEY secret.',
        manual_instructions: [
          '1. Open PowerPoint file',
          '2. Go to File → Export → Change File Type',
          '3. Select PNG format',
          '4. Click Save As and choose "Every Slide"',
          '5. Upload all exported images using the slideshow upload button'
        ]
      }, { status: 501 });
    }

    // Create CloudConvert job
    const jobResponse = await fetch('https://api.cloudconvert.com/v2/jobs', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tasks: {
          'import-pptx': {
            operation: 'import/url',
            url: fileUrl,
          },
          'convert-to-png': {
            operation: 'convert',
            input: 'import-pptx',
            output_format: 'png',
            pages: 'all',
          },
          'export-slides': {
            operation: 'export/url',
            input: 'convert-to-png',
          },
        },
      }),
    });

    const job = await jobResponse.json();

    if (!jobResponse.ok) {
      throw new Error(`CloudConvert error: ${job.message || 'Unknown error'}`);
    }

    // Wait for job to complete
    let jobStatus = job;
    while (jobStatus.data.status === 'waiting' || jobStatus.data.status === 'processing') {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const statusResponse = await fetch(`https://api.cloudconvert.com/v2/jobs/${job.data.id}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      jobStatus = await statusResponse.json();
    }

    if (jobStatus.data.status !== 'finished') {
      throw new Error('Conversion failed');
    }

    // Get the exported files
    const exportTask = jobStatus.data.tasks.find(t => t.operation === 'export/url');
    const slideUrls = exportTask.result.files.map(f => f.url);

    return Response.json({ 
      success: true,
      slideUrls: slideUrls,
      slideCount: slideUrls.length
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});