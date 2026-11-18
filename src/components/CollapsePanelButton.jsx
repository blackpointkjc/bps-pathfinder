import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function CollapsePanelButton({ isOpen, onClick, orientation = 'vertical', className }) {
    return (
        <button
            onClick={onClick}
            className={className || `${
                orientation === 'vertical'
                    ? 'w-5 h-16 rounded-r-lg'
                    : 'h-5 w-16 rounded-b-lg'
            } bg-[#111316]/90 backdrop-blur border border-l-0 border-[#635336] flex items-center justify-center text-slate-500 hover:text-white hover:bg-[#191a1b] transition-all`}
        >
            {orientation === 'vertical' ? (
                isOpen ? <ChevronLeft className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />
            ) : (
                isOpen ? <ChevronLeft className="w-3 h-3 rotate-90" /> : <ChevronRight className="w-3 h-3 rotate-90" />
            )}
        </button>
    );
}