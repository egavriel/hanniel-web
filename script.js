/* ======================================================================
   Hanniel — Interactions & Animations
   ====================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    /* ---------- Elements ---------- */
    const header = document.getElementById('header');
    const menuToggle = document.getElementById('menuToggle');
    const navOverlay = document.getElementById('navOverlay');
    const navLinks = document.querySelectorAll('.nav-link');
    const timelineItems = document.querySelectorAll('.timeline-item');
    const reveals = document.querySelectorAll('.reveal');
    const floatingWa = document.getElementById('floatingWa');

    /* ---------- Header scroll effect ---------- */
    let lastScroll = 0;

    function onScroll() {
        const scrollY = window.scrollY;

        // Header border on scroll
        if (scrollY > 10) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }

        // Floating WhatsApp button
        if (scrollY > 400) {
            floatingWa.classList.add('visible');
        } else {
            floatingWa.classList.remove('visible');
        }

        lastScroll = scrollY;
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    /* ---------- Mobile menu toggle ---------- */
    let menuOpen = false;

    function toggleMenu() {
        menuOpen = !menuOpen;
        menuToggle.classList.toggle('active', menuOpen);
        navOverlay.classList.toggle('open', menuOpen);
        document.body.style.overflow = menuOpen ? 'hidden' : '';
    }

    menuToggle.addEventListener('click', toggleMenu);

    // Close menu on link click
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            if (menuOpen) {
                toggleMenu();
            }
        });
    });

    // Close menu on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && menuOpen) {
            toggleMenu();
        }
    });

    /* ---------- Smooth scroll for timeline & nav links ---------- */
    function smoothScrollTo(targetId) {
        const target = document.getElementById(targetId);
        if (!target) return;

        const offset = parseInt(getComputedStyle(document.documentElement)
            .getPropertyValue('--header-height')) || 64;

        const top = target.getBoundingClientRect().top + window.scrollY - offset - 20;

        window.scrollTo({
            top,
            behavior: 'smooth'
        });
    }

    timelineItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const section = item.getAttribute('data-section');
            smoothScrollTo(section);
        });
    });

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const href = link.getAttribute('href').substring(1);
            smoothScrollTo(href);
        });
    });

    // Smooth scroll for all in-page anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', (e) => {
            const href = anchor.getAttribute('href');
            if (href === '#') return;
            e.preventDefault();
            smoothScrollTo(href.substring(1));
        });
    });

    /* ---------- Scroll Reveal (Apartment Coffee style fade-in) ---------- */
    const revealObserver = new IntersectionObserver(
        (entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    revealObserver.unobserve(entry.target);
                }
            });
        },
        {
            threshold: 0.12,
            rootMargin: '0px 0px -60px 0px'
        }
    );

    reveals.forEach(el => {
        // Don't re-observe hero elements (they have CSS animation)
        if (!el.closest('.hero')) {
            revealObserver.observe(el);
        }
    });

    const sections = [
        { id: 'hero', el: document.getElementById('hero') },
        { id: 'story-beginning', el: document.getElementById('story-beginning') },
        { id: 'story-oats', el: document.getElementById('story-oats') },
        // { id: 'story-christmas', el: document.getElementById('story-christmas') },
        { id: 'products', el: document.getElementById('products') },
    ];

    const timelineObserver = new IntersectionObserver(
        (entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const sectionId = entry.target.id;

                    timelineItems.forEach(item => {
                        if (item.getAttribute('data-section') === sectionId) {
                            item.classList.add('active');
                        } else {
                            item.classList.remove('active');
                        }
                    });
                }
            });
        },
        {
            threshold: 0.15,
            rootMargin: '-10% 0px -20% 0px'
        }
    );

    sections.forEach(s => {
        if (s.el) {
            timelineObserver.observe(s.el);
        }
    });

    /* ---------- Image parallax on scroll (subtle) ---------- */
    const heroImage = document.querySelector('.hero-image img');

    function updateParallax() {
        if (!heroImage) return;
        const scrollY = window.scrollY;
        const speed = 0.15;
        const maxTranslate = 60;
        const translate = Math.min(scrollY * speed, maxTranslate);
        heroImage.style.transform = `translateY(${translate}px)`;
    }

    // Only on desktop
    if (window.innerWidth > 1024) {
        window.addEventListener('scroll', updateParallax, { passive: true });
    }

    /* ---------- Page load entrance ---------- */
    document.body.style.opacity = '0';
    requestAnimationFrame(() => {
        document.body.style.transition = 'opacity 0.6s ease';
        document.body.style.opacity = '1';
    });
});
