/* Baraiac Piano Lessons — interactions */

const mobileMenuToggle = document.getElementById('mobileMenuToggle');
const mobileMenu = document.getElementById('mobileMenu');
const mobileNavLinks = document.querySelectorAll('.mobile-nav-links a');

function closeMobileMenu() {
  if (!mobileMenuToggle || !mobileMenu) return;
  mobileMenuToggle.classList.remove('active');
  mobileMenu.classList.remove('active');
  mobileMenuToggle.setAttribute('aria-expanded', 'false');
  mobileMenu.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

if (mobileMenuToggle && mobileMenu) {
  const toggleMenu = () => {
    const isOpen = mobileMenu.classList.contains('active');
    mobileMenuToggle.classList.toggle('active', !isOpen);
    mobileMenu.classList.toggle('active', !isOpen);
    mobileMenuToggle.setAttribute('aria-expanded', (!isOpen).toString());
    mobileMenu.setAttribute('aria-hidden', isOpen.toString());
    document.body.style.overflow = isOpen ? 'hidden' : '';
  };

  mobileMenuToggle.addEventListener('click', toggleMenu);
  mobileNavLinks.forEach((link) => link.addEventListener('click', closeMobileMenu));
}

function initStickyMobileCta() {
  const sticky = document.getElementById('mobileStickyCta');
  const hero = document.getElementById('home');
  const contact = document.getElementById('contact');
  if (!sticky || !hero) return;

  const mq = window.matchMedia('(max-width: 768px)');

  const update = () => {
    if (!mq.matches) {
      sticky.classList.remove('is-visible');
      document.body.classList.remove('mobile-cta-active');
      sticky.setAttribute('aria-hidden', 'true');
      return;
    }

    const contactTop = contact ? contact.getBoundingClientRect().top : Infinity;
    const show = contactTop > window.innerHeight * 0.35;

    sticky.classList.toggle('is-visible', show);
    document.body.classList.toggle('mobile-cta-active', show);
    sticky.setAttribute('aria-hidden', (!show).toString());
  };

  window.addEventListener('scroll', update, { passive: true });
  mq.addEventListener('change', update);
  update();
}

window.addEventListener('scroll', () => {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;
  navbar.classList.toggle('scrolled', window.scrollY > 24);
}, { passive: true });

const fadeObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('animate');
      fadeObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.fade-in, .stagger-children').forEach((el) => fadeObserver.observe(el));
  initTestimonialCarousel();
  initStickyMobileCta();
});

document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener('click', function (e) {
    const href = this.getAttribute('href');
    if (!href || href === '#') return;
    const target = document.querySelector(href);
    if (!target) return;
    e.preventDefault();
    const offset = document.getElementById('navbar')?.offsetHeight || 72;
    const y = target.getBoundingClientRect().top + window.pageYOffset - offset;
    window.scrollTo({ top: y, behavior: 'smooth' });
    closeMobileMenu();
  });
});

function initTestimonialCarousel() {
  const carousel = document.getElementById('testimonialCarousel');
  if (!carousel) return;

  const slides = carousel.querySelectorAll('.testimonial-slide');
  const dotsContainer = carousel.querySelector('.carousel-dots');
  const prevBtn = carousel.querySelector('.carousel-prev');
  const nextBtn = carousel.querySelector('.carousel-next');
  let current = 0;
  let autoplayId;

  slides.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'carousel-dot' + (i === 0 ? ' is-active' : '');
    dot.setAttribute('aria-label', `Review ${i + 1}`);
    dot.setAttribute('role', 'tab');
    dot.addEventListener('click', () => goTo(i));
    dotsContainer.appendChild(dot);
  });

  const dots = dotsContainer.querySelectorAll('.carousel-dot');

  function goTo(index) {
    slides[current].classList.remove('is-active');
    dots[current].classList.remove('is-active');
    current = (index + slides.length) % slides.length;
    slides[current].classList.add('is-active');
    dots[current].classList.add('is-active');
    resetAutoplay();
  }

  function resetAutoplay() {
    clearInterval(autoplayId);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    autoplayId = setInterval(() => goTo(current + 1), 6000);
  }

  prevBtn?.addEventListener('click', () => goTo(current - 1));
  nextBtn?.addEventListener('click', () => goTo(current + 1));
  resetAutoplay();
}
