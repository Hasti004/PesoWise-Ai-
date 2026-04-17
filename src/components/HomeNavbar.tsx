import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { useState } from "react";

export function HomeNavbar() {
    const navigate = useNavigate();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    return (
        <header className="sticky top-0 z-50 w-full border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 shadow-sm">
            <nav className="container mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex h-16 items-center justify-between gap-2 min-w-0">
                    {/* Logo */}
                    <div
                        className="flex flex-shrink-0 items-center gap-2 cursor-pointer min-w-0"
                        onClick={() => navigate("/")}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === "Enter" && navigate("/")}
                    >
                        <img src="/HERO.png" alt="PesoWise Logo" className="h-8 w-auto flex-shrink-0 rounded-lg" />
                        <span className="text-xl font-bold text-foreground truncate">PesoWise</span>
                    </div>

                    {/* Desktop Navigation Links */}
                    <div className="hidden md:flex items-center gap-8">
                        <button
                            onClick={() => navigate("/")}
                            className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors"
                        >
                            Home
                        </button>
                        <button
                            onClick={() => navigate("/features")}
                            className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors"
                        >
                            Features
                        </button>
                        <button
                            onClick={() => navigate("/how-it-works")}
                            className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors"
                        >
                            How It Works
                        </button>
                        <button
                            onClick={() => navigate("/security")}
                            className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors"
                        >
                            Security
                        </button>
                        <button
                            onClick={() => navigate("/pricing")}
                            className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors"
                        >
                            Pricing
                        </button>
                        <button
                            onClick={() => navigate("/contact")}
                            className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors"
                        >
                            Contact
                        </button>
                    </div>

                    {/* Desktop CTAs */}
                    <div className="hidden md:flex items-center gap-3">
                        <Button
                            variant="outline"
                            onClick={() => navigate("/contact")}
                            className="text-sm"
                        >
                            Get Started Free
                        </Button>
                        <Button
                            onClick={() => navigate("/auth")}
                            className="bg-blue-600 hover:bg-blue-700 text-white text-base font-bold px-7 py-2.5 shadow-lg ring-2 ring-blue-600/20"
                            aria-label="Login to PesoWise"
                        >
                            Login
                        </Button>
                    </div>

                    {/* Mobile: menu button + login (touch-friendly) */}
                    <div className="md:hidden flex flex-shrink-0 items-center gap-1">
                        <button
                            type="button"
                            className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100 active:bg-gray-200 touch-manipulation"
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
                            aria-expanded={mobileMenuOpen}
                        >
                            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
                        </button>
                        <Button
                            onClick={() => navigate("/auth")}
                            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-4 py-2.5 h-11 touch-manipulation"
                            aria-label="Login to PesoWise"
                        >
                            Login
                        </Button>
                    </div>
                </div>

                {/* Mobile Menu (touch-friendly tap targets) */}
                {mobileMenuOpen && (
                    <div className="md:hidden border-t bg-white py-2" role="navigation" aria-label="Main">
                        <div className="flex flex-col">
                            <button
                                type="button"
                                onClick={() => { navigate("/"); setMobileMenuOpen(false); }}
                                className="text-left text-sm font-medium text-gray-700 hover:text-blue-600 hover:bg-gray-50 active:bg-gray-100 transition-colors px-4 py-3 min-h-[44px] touch-manipulation"
                            >
                                Home
                            </button>
                            <button
                                type="button"
                                onClick={() => { navigate("/features"); setMobileMenuOpen(false); }}
                                className="text-left text-sm font-medium text-gray-700 hover:text-blue-600 hover:bg-gray-50 active:bg-gray-100 transition-colors px-4 py-3 min-h-[44px] touch-manipulation"
                            >
                                Features
                            </button>
                            <button
                                type="button"
                                onClick={() => { navigate("/how-it-works"); setMobileMenuOpen(false); }}
                                className="text-left text-sm font-medium text-gray-700 hover:text-blue-600 hover:bg-gray-50 transition-colors px-4 py-3 min-h-[44px] touch-manipulation"
                            >
                                How It Works
                            </button>
                            <button
                                type="button"
                                onClick={() => { navigate("/security"); setMobileMenuOpen(false); }}
                                className="text-left text-sm font-medium text-gray-700 hover:text-blue-600 hover:bg-gray-50 transition-colors px-4 py-3 min-h-[44px] touch-manipulation"
                            >
                                Security
                            </button>
                            <button
                                type="button"
                                onClick={() => { navigate("/pricing"); setMobileMenuOpen(false); }}
                                className="text-left text-sm font-medium text-gray-700 hover:text-blue-600 hover:bg-gray-50 transition-colors px-4 py-3 min-h-[44px] touch-manipulation"
                            >
                                Pricing
                            </button>
                            <button
                                type="button"
                                onClick={() => { navigate("/contact"); setMobileMenuOpen(false); }}
                                className="text-left text-sm font-medium text-gray-700 hover:text-blue-600 hover:bg-gray-50 transition-colors px-4 py-3 min-h-[44px] touch-manipulation"
                            >
                                Contact
                            </button>
                            <div className="px-4 py-3">
                                <Button
                                    variant="outline"
                                    onClick={() => { navigate("/contact"); setMobileMenuOpen(false); }}
                                    className="w-full min-h-[44px] touch-manipulation"
                                >
                                    Get Started Free
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </nav>
        </header>
    );
}
