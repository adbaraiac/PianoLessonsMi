/*
// TemplateMo 593 personal shape
// https://templatemo.com/tm-593-personal-shape
*/

// ===== Mobile menu =====
const mobileMenuToggle = document.getElementById('mobileMenuToggle');
const mobileMenu = document.getElementById('mobileMenu');
const mobileNavLinks = document.querySelectorAll('.mobile-nav-links a');

if (mobileMenuToggle) {
  const toggleMenu = () => {
    const expanded = mobileMenuToggle.getAttribute('aria-expanded') === 'true' || false;
    mobileMenuToggle.setAttribute('aria-expanded', (!expanded).toString());
    mobileMenuToggle.classList.toggle('active');
    mobileMenu.classList.toggle('active');
    const isActive = mobileMenu.classList.contains('active');
    mobileMenu.setAttribute('aria-hidden', (!isActive).toString());
    document.body.style.overflow = isActive ? 'hidden' : 'auto';
  };

  mobileMenuToggle.addEventListener('click', toggleMenu);
  mobileMenuToggle.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleMenu(); } });

  mobileNavLinks.forEach(link => {
    link.addEventListener('click', () => {
      mobileMenuToggle.classList.remove('active');
      mobileMenu.classList.remove('active');
      mobileMenuToggle.setAttribute('aria-expanded', 'false');
      mobileMenu.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = 'auto';
    });
  });

  document.addEventListener('click', (e) => {
    if (!mobileMenuToggle.contains(e.target) && !mobileMenu.contains(e.target)) {
      mobileMenuToggle.classList.remove('active');
      mobileMenu.classList.remove('active');
      mobileMenuToggle.setAttribute('aria-expanded', 'false');
      mobileMenu.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = 'auto';
    }
  });
}

// ===== Navbar scroll effect =====
window.addEventListener('scroll', () => {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;
  if (window.scrollY > 50) {
    navbar.classList.add('scrolled');
  } else {
    navbar.classList.remove('scrolled');
  }
});

// ===== Intersection Observer (animations) =====
const observerOptions = { threshold: 0.15, rootMargin: '0px 0px -80px 0px' };
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add('animate'); });
}, observerOptions);

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.fade-in, .slide-in-left, .slide-in-right').forEach(el => observer.observe(el));

  const portfolioSection = document.querySelector('.portfolio-grid');
  if (portfolioSection) {
    const portfolioObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const items = entry.target.querySelectorAll('.portfolio-item');
          items.forEach((item, index) => { setTimeout(() => item.classList.add('animate'), index * 120); });
        }
      });
    }, { threshold: 0.1 });
    portfolioObserver.observe(portfolioSection);
  }
});

// ===== Smooth scrolling =====
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    const target = document.querySelector(this.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    const y = target.getBoundingClientRect().top + window.pageYOffset - 80;
    window.scrollTo({ top: y, behavior: 'smooth' });
  });
});


// ===== Parallax effect (subtle) =====
let ticking = false;
function updateParallax() {
  const hero = document.querySelector('.hero');
  if (!hero) return;
  const rate = window.pageYOffset * -0.2;
  hero.style.transform = `translateY(${rate}px)`;
  ticking = false;
}
window.addEventListener('scroll', () => {
  if (!ticking) { requestAnimationFrame(updateParallax); ticking = true; }
});

// ===== Hover effects on skill tags =====
document.querySelectorAll('.skill-tag').forEach(tag => {
  tag.addEventListener('mouseenter', () => { tag.style.transform = 'translateY(-2px) scale(1.05)'; });
  tag.addEventListener('mouseleave', () => { tag.style.transform = 'translateY(0) scale(1)'; });
});
