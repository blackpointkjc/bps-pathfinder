export default function About() {
    return (
        <div className="min-h-screen bg-slate-950 text-white px-6 py-12 max-w-3xl mx-auto">
            <h1 className="text-3xl font-bold font-mono text-gold mb-6">About BPS CAD</h1>
            <div className="space-y-5 text-slate-300 leading-relaxed text-sm font-mono">
                <p>
                    BPS CAD (Computer-Aided Dispatch) is a professional-grade command and control platform
                    built for law enforcement, security, and emergency response organizations. It provides
                    dispatchers and field officers with a unified, real-time operating picture — combining
                    live GPS tracking, incident management, and unit coordination in a single interface.
                </p>
                <p>
                    The platform is designed for security companies, private police agencies, campus safety
                    departments, and municipal dispatch centers that need a modern, reliable CAD system
                    without the complexity or cost of legacy enterprise software.
                </p>
                <p>
                    Key capabilities include a live tactical map showing all active units and their statuses,
                    an integrated dispatch queue for managing inbound calls, officer distress alerts with
                    automatic GPS logging, call history and archiving, shift scheduling, vehicle maintenance
                    tracking, and AI-assisted call summaries and optimal unit suggestions.
                </p>
                <p>
                    Field officers access the platform from any device — desktop, tablet, or mobile — and
                    can update their status, view assigned calls, navigate to incidents, and communicate
                    with dispatch in real time. Dispatchers get a comprehensive command dashboard with
                    full situational awareness across all active units and incidents.
                </p>
                <p>
                    BPS CAD is built and maintained by the BPS Command Systems team, a group of technology
                    professionals with deep roots in public safety and private security operations. Our
                    mission is to give every organization — large or small — the tools to protect people
                    and coordinate response effectively.
                </p>
            </div>
            <div className="mt-10 pt-6 border-t border-slate-800">
                <a href="/Contact" className="text-gold font-mono text-sm hover:underline">
                    → Contact Us
                </a>
            </div>
        </div>
    );
}