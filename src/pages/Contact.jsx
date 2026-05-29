import { useState } from 'react';
import { base44 } from '@/api/base44Client';

export default function Contact() {
    const [submitted, setSubmitted] = useState(false);
    const [form, setForm] = useState({ name: '', email: '', message: '' });

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await base44.integrations.Core.SendEmail({
                to: 'management@blackpointkjc.com',
                subject: `BPS CAD Contact: Message from ${form.name}`,
                body: `Name: ${form.name}\nEmail: ${form.email}\n\nMessage:\n${form.message}`
            });
        } catch {}
        setSubmitted(true);
    };

    return (
        <div className="min-h-screen bg-slate-950 text-white px-6 py-12 max-w-2xl mx-auto">
            <h1 className="text-3xl font-bold font-mono text-gold mb-4">Contact Us</h1>
            <p className="text-slate-400 font-mono text-sm mb-8">
                Have questions about BPS CAD? Reach out to our team — we're here to help.
            </p>

            <div className="mb-8 space-y-3 text-sm font-mono">
                <div className="flex items-center gap-3">
                    <span className="text-slate-500">Email:</span>
                    <a href="mailto:management@blackpointkjc.com" className="text-gold hover:underline">
                        management@blackpointkjc.com
                    </a>
                </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                <h2 className="text-white font-mono font-bold text-base mb-4">Send a Message</h2>
                {submitted ? (
                    <div className="text-green-400 font-mono text-sm py-4">
                        ✓ Message received. We'll get back to you shortly.
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-slate-400 font-mono text-xs mb-1">Name</label>
                            <input
                                required
                                value={form.name}
                                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-gold"
                                placeholder="Your name"
                            />
                        </div>
                        <div>
                            <label className="block text-slate-400 font-mono text-xs mb-1">Email</label>
                            <input
                                required
                                type="email"
                                value={form.email}
                                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-gold"
                                placeholder="your@email.com"
                            />
                        </div>
                        <div>
                            <label className="block text-slate-400 font-mono text-xs mb-1">Message</label>
                            <textarea
                                required
                                value={form.message}
                                onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                                rows={4}
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-gold resize-none"
                                placeholder="How can we help?"
                            />
                        </div>
                        <button
                            type="submit"
                            className="w-full bg-gold text-black font-mono font-bold py-2.5 rounded-lg hover:opacity-90 transition-opacity text-sm"
                        >
                            Send Message
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}