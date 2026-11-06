import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Search, ShoppingBag, ArrowUpRight, Plus, Minus, X, Menu, Check, ShieldCheck, Truck, RotateCcw, PackageCheck, UserRound, MapPin, Clock, FileText, AlertTriangle, Bell, Tag, Ban, MessageCircle, Printer, TrendingUp, DollarSign, Users, Crown, Eye, Archive } from 'lucide-react';
import './styles.css';

const RAW = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '');
const API = RAW.includes('/api') ? RAW : RAW + '/api';
const API_URL = API;

const fallbackProducts = [
 {id:1,name:'Studio Wireless Headphones',category:'Tech',description:'Immersive sound, comfortable fit and all-day battery life.',price:1299,sale_price:999,on_sale:true,image_url:'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=85',stock:25,is_active:true},
 {id:2,name:'Minimal Desk Lamp',category:'Home',description:'Warm, modern lamp for workspace.',price:649,image_url:'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=900&q=85',stock:18,is_active:true},
 {id:3,name:'Everyday Canvas Backpack',category:'Lifestyle',description:'Durable everyday backpack.',price:899,image_url:'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=85',stock:0,is_active:true},
 {id:4,name:'Classic Sunglasses',category:'Accessories',description:'Timeless frames.',price:499,image_url:'https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=900&q=85',stock:30,is_active:true},
 {id:5,name:'Smart Watch',category:'Tech',description:'Track activity.',price:1599,image_url:'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=85',stock:12,is_active:true},
 {id:6,name:'Ceramic Coffee Set',category:'Home',description:'Ceramic set.',price:379,image_url:'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=900&q=85',stock:16,is_active:true},
 {id:7,name:'Everyday Sneakers',category:'Lifestyle',description:'Comfort sneakers.',price:1099,image_url:'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=85',stock:14,is_active:true},
 {id:8,name:'Reusable Travel Bottle',category:'Accessories',description:'Reusable bottle.',price:249,image_url:'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=900&q=85',stock:40,is_active:true}
];
const sortByDateDesc = (a,b) => new Date(b.created_at) - new Date(a.created_at);
const fmt = n => new Intl.NumberFormat('en-ZA',{style:'currency',currency:'ZAR',maximumFractionDigits:2}).format(Number(n||0));
const PROVINCES = ['LIMPOPO','GAUTENG','WESTERN CAPE','EASTERN CAPE','KWAZULU-NATAL','FREE STATE','MPUMALANGA','NORTH WEST','NORTHERN CAPE'];

// === FIX B: STATUS MAP & SAFE HELPER ===
const STATUS_MAP = {
  'Order Placed':'pending',
  'Processing':'processing',
  'Packed':'processing',
  'Shipped':'shipped',
  'Out for Delivery':'shipped',
  'Delivered':'delivered',
  'Delayed':'processing',
  'Cancelled':'cancelled',
  'Refunded':'refunded',
  'Refund Pending':'refund_pending',
  'Failed':'failed'
};
const DB_SAFE_STATUSES = ['pending','paid','processing','shipped','delivered','cancelled','refunded','refund_pending','failed'];
function toSafeStatus(s){
  if(!s) return 'pending';
  const lower = String(s).toLowerCase().trim();
  if(lower === 'delivered') return 'delivered';
  if(lower === 'refunded' || lower === 'refund') return 'refunded';
  if(lower === 'refund_pending' || lower === 'refund pending') return 'refund_pending';
  if(DB_SAFE_STATUSES.includes(lower)) return lower;
  return STATUS_MAP[s] || 'processing';
}

function isValidSAphone(phone){
  const cleaned = String(phone||'').replace(/\s/g,'');
  return /^(?:\+27|27|0)[6-8][0-9]{8}$/.test(cleaned);
}

async function api(path, options={}) { 
  const token=localStorage.getItem('uc_token'); 
  const url = path.startsWith('http') ? path : `${API}${path}`;
  const res=await fetch(url,{...options,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`} : {}),...(options.headers||{})}}); 
  const data=await res.json().catch(()=>({})); 
  if(!res.ok) throw new Error(data.error||`Request failed: ${res.status}`); 
  return data; 
}

function getCartKey(user){ return `uc_cart_${user?.id || 'guest'}`; }
function effectivePrice(p){ return p.on_sale && p.sale_price ? Number(p.sale_price) : Number(p.price); }

function getProductImages(p){
  if(!p) return [];
  let extra = [];
  try{
    extra = Array.isArray(p.images) ? p.images : (typeof p.images === 'string' ? JSON.parse(p.images || '[]') : []);
  }catch{ extra = []; }
  const all = [p.image_url, ...extra].filter(Boolean);
  const unique = [...new Set(all)];

  // If admin hasn't added extras yet, fill with category defaults
  if(unique.length < 5){
    const defaults = DEFAULT_GALLERY[p.category] || DEFAULT_GALLERY['Lifestyle'];
    for(const d of defaults){
      if(unique.length >= 5) break;
      if(!unique.includes(d)) unique.push(d);
    }
  }
  return unique.slice(0,5);
}

const DEFAULT_GALLERY = {
  'Tech': [
    'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=85',
    'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=85',
    'https://images.unsplash.com/photo-1583394838336-acd977736f90?auto=format&fit=crop&w=900&q=85',
    'https://images.unsplash.com/photo-1546435770-a3e426bf472b?auto=format&fit=crop&w=900&q=85',
  ],
  'Home': [
    'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=900&q=85',
    'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=900&q=85',
    'https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=900&q=85',
    'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=900&q=85',
  ],
  'Lifestyle': [
    'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=85',
    'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=85',
    'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=85',
    'https://images.unsplash.com/photo-1546868871-7041f2a55e12?auto=format&fit=crop&w=900&q=85',
  ],
  'Accessories': [
    'https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=900&q=85',
    'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=900&q=85',
    'https://images.unsplash.com/photo-1572635196237-14b3f281503f?auto=format&fit=crop&w=900&q=85',
    'https://images.unsplash.com/photo-1611312449408-fcece27cdbb7?auto=format&fit=crop&w=900&q=85',
  ],
};

function isOutOfStock(p){ return !p.is_active || Number(p.stock) <= 0; }

function printDoc(html){
  const w = window.open('', '_blank', 'width=800,height=900');
  if(!w) return;
  w.document.write(html);
  w.document.close();
  setTimeout(()=>w.print(), 400);
}

function App(){
 const [products,setProducts]=useState(fallbackProducts),[category,setCategory]=useState('All'),[search,setSearch]=useState(''),[cart,setCart]=useState([]),[cartOpen,setCartOpen]=useState(false),[checkoutOpen,setCheckoutOpen]=useState(false),[notice,setNotice]=useState(''),[loading,setLoading]=useState(true),[menuOpen,setMenuOpen]=useState(false),[accountOpen,setAccountOpen]=useState(false),[authMode,setAuthMode]=useState('login'),[user,setUser]=useState(()=>JSON.parse(localStorage.getItem('uc_user')||'null')),[orders,setOrders]=useState([]),[adminOpen,setAdminOpen]=useState(false),[adminOrders,setAdminOrders]=useState([]),[adminUsers,setAdminUsers]=useState([]),[busy,setBusy]=useState(false),[selectedProduct,setSelectedProduct]=useState(null),[showAll,setShowAll]=useState(false);
 const [activeTab,setActiveTab]=useState('shop');
 const [searchOpen,setSearchOpen]=useState(false);
 const [checkoutError,setCheckoutError]=useState('');
 const [trackingOrders,setTrackingOrders]=useState([]);
 const [editingOrder,setEditingOrder]=useState(null);
 const [cancelModal,setCancelModal]=useState(null);
 const [cancelReason,setCancelReason]=useState('');
 const [editData,setEditData]=useState({delivery_status:'Order Placed', current_location:'Warehouse - Lephalale', eta:'1-2 business days', tracking_note:''});
 const [form,setForm]=useState({full_name:'',email:'',phone:'',address_search:'',delivery_address:'',province:'LIMPOPO',postal_code:''});
 const [authForm,setAuthForm]=useState({name:'',email:'',password:'', acceptTerms:false});
 const [authError,setAuthError]=useState('');
 const [showTerms,setShowTerms]=useState(false);
 const [termsTab,setTermsTab]=useState('Shipping');
 const [termsFromSignup,setTermsFromSignup]=useState(false);
 const [adminTab,setAdminTab]=useState('dashboard');
 const [prodForm,setProdForm]=useState({name:'',category:'Tech',price:'',sale_price:'',on_sale:false,stock:'',description:'',image_url:'',images:['','','',''],is_active:true,unit:'none',unit_value:''});
 const [editingId,setEditingId]=useState(null);
 const [orderFilter,setOrderFilter]=useState('all');
 const [userSearch,setUserSearch]=useState('');
 const [phoneOtpSent, setPhoneOtpSent] = useState(false);
 const [phoneOtp, setPhoneOtp] = useState('');
 const [phoneVerified, setPhoneVerified] = useState(false);
 const [phoneVerifiedToken, setPhoneVerifiedToken] = useState('');
 const [otpStatus, setOtpStatus] = useState('');
 const [galleryIndex, setGalleryIndex] = useState(0);
 const [cookieConsent, setCookieConsent] = useState(() => localStorage.getItem('uc_cookie_consent') === 'yes');

 // === FIX A: Forgot password states ===
 const [forgotOpen,setForgotOpen]=useState(false);
 const [forgotEmail,setForgotEmail]=useState('');
 const [forgotMessage,setForgotMessage]=useState('');
 const categories=['All','Tech','Home','Lifestyle','Accessories'];
 const [resetToken, setResetToken] = useState(null);
const [resetOpen, setResetOpen] = useState(false);
const [newPassword, setNewPassword] = useState('');
const [resetMessage, setResetMessage] = useState('');
const [forgotStatus, setForgotStatus] = useState('');
const [resetPassword, setResetPassword] = useState('');
const [resetStatus, setResetStatus] = useState('');

  useEffect(()=>{
    const params = new URLSearchParams(window.location.search);
    const t = params.get('reset_token');
    if(t){
      setResetToken(t);
      setResetOpen(true);
      setAccountOpen(false);
      setForgotOpen(false);
    }
  },[]);

 useEffect(()=>{
   const key = getCartKey(user);
   try{
     const saved = JSON.parse(localStorage.getItem(key) || '[]');
     if(!user) setCart(Array.isArray(saved) ? saved : []);
   }catch{ if(!user) setCart([]); }
   if(user){
     api('/cart/mine').then(dbRows=>{
       if(Array.isArray(dbRows) && dbRows.length){
         const mapped = dbRows.map(r=>({
           id: r.product_id,
           product_id: r.product_id,
           quantity: r.quantity,
           name: r.name,
           price: effectivePrice(r),
           original_price: r.price,
           sale_price: r.sale_price,
           on_sale: r.on_sale,
           image_url: r.image_url,
           description: r.description || '',
           category: r.category || 'Tech',
           stock: r.stock ?? 99,
           is_active: r.is_active ?? true
         }));
         setCart(mapped);
         localStorage.setItem(key, JSON.stringify(mapped));
       }
     }).catch(()=>{});
   }
 },[user]);

async function sendPhoneOtp(){
  const phone = form.phone?.trim();
  if(!isValidSAphone(phone)){ setOtpStatus('❌ Invalid SA phone'); return; }
  setOtpStatus('Sending OTP...');
  try{
    const r = await fetch(`${API_URL}/auth/send-phone-otp`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ phone: form.phone, otp: phoneOtp })
    });
    const data = await r.json();
    if(!r.ok) throw new Error(data.error);
    setPhoneOtpSent(true);
    setOtpStatus(`✅ OTP sent to ${phone}. Check SMS${data.debug_otp ? ` (TEST OTP: ${data.debug_otp})` : ''}`);
  }catch(e){ setOtpStatus('❌ '+e.message); }
}

async function verifyPhoneOtp(){
  try{
    const r = await fetch(`${API_URL}/auth/verify-phone-otp`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ phone: form.phone, otp: phoneOtp })
    });
    const data = await r.json();
    if(!r.ok) throw new Error(data.error);
    setPhoneVerified(true);
    setPhoneVerifiedToken(data.phoneVerifiedToken);
    setOtpStatus('✅ Phone verified! You can now place order.');
  }catch(e){ setOtpStatus('❌ '+e.message); }
}


async function handleForgotSubmit(e){
  e.preventDefault();
  setForgotStatus('Sending...');
  try{
    const r = await fetch(`${API_URL}/auth/forgot-password`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ email: forgotEmail })
    });
    const data = await r.json();
    if(!r.ok) throw new Error(data.error || 'Failed');
    setForgotStatus('✅ Reset link sent! Check inbox & spam folder.');
  }catch(err){
    setForgotStatus('❌ ' + err.message);
  }
}

async function handleResetSubmit(e){
  e.preventDefault();
  setResetStatus('Resetting...');
  try{
    const r = await fetch(`${API_URL}/auth/reset-password`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ token: resetToken, newPassword: resetPassword })
    });
    const data = await r.json();
    if(!r.ok) throw new Error(data.error || 'Failed');
    setResetStatus('✅ Password changed! You can now login.');
    setTimeout(()=>{
      setResetOpen(false);
      setResetToken('');
      setResetPassword('');
      window.history.replaceState({}, '', '/');
    },2000);
  }catch(err){
    setResetStatus('❌ ' + err.message);
  }
}

 useEffect(()=>{
   const key = getCartKey(user);
   localStorage.setItem(key, JSON.stringify(cart));
   localStorage.removeItem('uc_cart');
 },[cart, user]);

 useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    if(params.get('payment')==='return'){ 
      const key = getCartKey(user);
      localStorage.removeItem(key);
      localStorage.removeItem('lastOrderId'); 
      localStorage.removeItem('uc_cart_backup'); // <-- ADD THIS LINE
      setCart([]);
      setNotice(`Payment successful! Order #${params.get('order')} received. Receipt sent to your email.`); 
      window.history.replaceState({}, '', window.location.pathname);
      setActiveTab('track');
      loadTracking();
    }

  if(params.get('payment')==='cancel'){
    const cancelledOrderId = params.get('order') || localStorage.getItem('lastOrderId');
    if(cancelledOrderId){
      // Mark it cancelled so it doesn't sit in TRACK ORDER as pending
      api(`/orders/${cancelledOrderId}/cancel`, {method:'POST'}).catch(()=>{});
      localStorage.removeItem('lastOrderId');
    }

    // RESTORE CART - this is the new part
    try{
      const backup = JSON.parse(localStorage.getItem('uc_cart_backup') || '[]');
      if(backup.length){
        setCart(backup);
        const key = getCartKey(user);
        localStorage.setItem(key, JSON.stringify(backup));
        // Put it back in DB cart too, so refresh doesn't wipe it
        backup.forEach(async (item)=>{
          try{ await api('/cart',{method:'POST', body:JSON.stringify({product_id:item.id, quantity:item.quantity})}); }catch{}
        });
      }
    }catch{}

    setNotice('Payment cancelled - order cancelled. Your items are still in your bag.');
    window.history.replaceState({}, '', window.location.pathname);
    loadTracking();
  }

 },[user]);

 useEffect(()=>{api('/products').then((rows)=>{ if(Array.isArray(rows)&&rows.length) setProducts(rows); }).catch(()=>{}).finally(()=>setLoading(false));},[]);
 useEffect(()=>{
   if(user){
     setForm(f=>({...f, full_name: user.name || f.full_name, email: user.email || f.email }));
     api('/orders/mine').then(setOrders).catch(()=>{});
     loadTracking();
   }
 },[user]);
 useEffect(()=>{if(notice){const t=setTimeout(()=>setNotice(''),6500);return()=>clearTimeout(t);}},[notice]);

 // === FIX C: Cmd+K focus search ===
 useEffect(()=>{
   const onKey = (e)=>{
     if((e.metaKey || e.ctrlKey) && e.key.toLowerCase()==='k'){
       e.preventDefault();
       const desktop = document.querySelector('.desktop-search input');
       if(desktop){ desktop.focus(); }
       else { setSearchOpen(true); }
     }
   };
   window.addEventListener('keydown', onKey);
   return ()=>window.removeEventListener('keydown', onKey);
 },[]);

  async function loadTracking(){
    const data = await api('/orders/my-orders');
    const sorted = [...(data||[])].sort(sortByDateDesc); // NEW
    setTrackingOrders(sorted);
    setOrders(sorted);
  }

 const visible=useMemo(()=>products.filter(p=>(category==='All'|| (p.category||'').toLowerCase()===category.toLowerCase())&& `${p.name} ${p.description} ${p.category}`.toLowerCase().includes(search.toLowerCase())),[products,category,search]);
 const visibleAll=useMemo(()=>products.filter(p=> `${p.name} ${p.description} ${p.category}`.toLowerCase().includes(search.toLowerCase())),[products,search]);
 const count = cart.reduce((s,p)=>s+p.quantity,0), total=cart.reduce((s,p)=>s+effectivePrice(p)*p.quantity,0);    
 const setField=(k,v)=>setForm(f=>({...f,[k]:v}));
 const hasOrders = trackingOrders.length > 0 || orders.length > 0;

 const analytics = useMemo(()=>{
   const todayStr = new Date().toISOString().slice(0,10);
   const thisMonth = new Date().toISOString().slice(0,7);
   let todayRev=0, monthRev=0, totalRev=0;
   let pending=0, failed=0;
   const salesMap = {};
   adminOrders.forEach(o=>{
     const d = (o.created_at||'').slice(0,10);
     const m = (o.created_at||'').slice(0,7);
     const amt = Number(o.total||0);
     if(o.status!=='cancelled' && o.status!=='refunded' && o.payment_status!=='failed'){
       totalRev+=amt;
       if(d===todayStr) todayRev+=amt;
       if(m===thisMonth) monthRev+=amt;
     }
     if(o.status==='pending') pending++;
     if(o.payment_status==='failed') failed++;
     (o.items||[]).forEach(it=>{
       const k = it.product_id || it.id || it.name;
       salesMap[k] = salesMap[k] || {name: it.name, qty:0, total:0, id:k};
       salesMap[k].qty += Number(it.quantity||0);
       salesMap[k].total += Number(it.price||0)*Number(it.quantity||0);
     });
   });
   const best = Object.values(salesMap).sort((a,b)=>b.qty-a.qty).slice(0,5);
   return {todayRev, monthRev, totalRev, pending, failed, best, totalOrders: adminOrders.length};
 },[adminOrders]);

 async function add(p){
   if(isOutOfStock(p)){ setNotice(`${p.name} is out of stock`); return; }
   setCart(old=>{
     const cartKey = p.unit==='size' ? `${p.id}_${p.selectedSize}` : p.id;
     const found=old.find(x=>x.id===p.id);
     return found?old.map(x=>x.id===p.id?{...x,quantity:Math.min(x.quantity+1,99)}:x):[...old,{...p, price: effectivePrice(p), original_price: p.price, quantity:1}];
   });
   setNotice(`${p.name} added to bag`);
   if(user){
     try{ await api('/cart',{method:'POST', body:JSON.stringify({product_id:p.id, quantity:1})}); }catch{}
   }
 }

 async function changeQty(id,d){
   const current = cart.find(x=>x.id===id);
   if(!current) return;
   const newQty = current.quantity + d;
   if(newQty <=0){ setCart(old=>old.filter(x=>x.id!==id)); }
   else{ setCart(old=>old.map(p=>p.id===id?{...p,quantity:newQty}:p)); }
   if(user){
     try{
       if(newQty<=0) await api(`/cart/${id}`,{method:'DELETE'});
       else await api(`/cart/${id}`,{method:'PATCH', body:JSON.stringify({quantity:newQty})});
     }catch{}
   }
 }

 const changeSize = (id, newSize) => {
  setCart(cart.map(item => item.id === id ? {...item, selectedSize: newSize} : item));
};

 async function removeItem(id){
   setCart(old=>old.filter(x=>x.id!==id));
   if(user){ try{ await api(`/cart/${id}`,{method:'DELETE'});}catch{} }
 }
 async function clearCart(){
   setCart([]);
   if(user){ try{ await api('/cart',{method:'DELETE'});}catch{} }
   const key=getCartKey(user);
   localStorage.removeItem(key);
 }
 function openProduct(p){
   setSelectedProduct(p); 
   setGalleryIndex(0);
   setShowAll(false); 
   setSelectedSize('');
   setActiveTab('shop');
    window.scrollTo({top:0, behavior:'smooth'}); }
 function closeProduct(){ setSelectedProduct(null); }
 function handleViewEverything(){ setCategory('All'); setSearch(''); setShowAll(true); setSelectedProduct(null); setActiveTab('shop'); window.scrollTo({top:0, behavior:'smooth'}); }
 function handleHome(){ setShowAll(false); closeProduct(); setCategory('All'); setSearch(''); setActiveTab('shop'); window.scrollTo({top:0, behavior:'smooth'}); }

 async function submitAuth(e){
  e.preventDefault(); 
  setAuthError('');
  if(authMode==='register' && !authForm.acceptTerms){
    setAuthError('You must accept the Terms & Conditions to create an account.');
    return;
  }
  setBusy(true);
  try{
    const payload = {name: authForm.name, email: authForm.email, password: authForm.password};
    const data=await api(`/auth/${authMode}`,{method:'POST',body:JSON.stringify(payload)});
    const guestKey = getCartKey(null);
    const guestCart = JSON.parse(localStorage.getItem(guestKey) || '[]');
    localStorage.setItem('uc_token',data.token);
    localStorage.setItem('uc_user',JSON.stringify(data.user));
    setUser(data.user);
    setAccountOpen(false); 
    setNotice(`Welcome${data.user.name?','+data.user.name.split(' ')[0]:''}!`); 
    setAuthForm({name:'',email:'',password:'', acceptTerms:false});
    setAuthError('');
    if(guestCart.length){
      for(const item of guestCart){
        try{ await api('/cart',{method:'POST', body:JSON.stringify({product_id:item.id, quantity:item.quantity})}); }catch{}
      }
      localStorage.removeItem(guestKey);
    }
  }catch(err){ setAuthError(err.message); }
  finally{setBusy(false);} 
 }

 function logout(){
  const key = getCartKey(user);
  localStorage.removeItem('uc_token');
  localStorage.removeItem('uc_user');
  localStorage.removeItem('uc_cart');
  localStorage.removeItem('cart');
  localStorage.removeItem('uc_cart_guest');
  localStorage.removeItem(key);
  setUser(null);
  setOrders([]);
  setTrackingOrders([]);
  setCart([]);
  setAdminOpen(false);
  setAccountOpen(false);
  setActiveTab('shop');
  setNotice('You have signed out. Your bag is saved for next login.');
 }

 async function loadTracking(){
  const data = await api('/orders/my-orders');
  const sorted = [...(data||[])].filter(o=>o.status!=='cancelled').sort(sortByDateDesc);
  setTrackingOrders(sorted);
  setOrders(sorted);
}

 async function deleteAccount(){
  if(!confirm('Delete your account? This will permanently delete your account, orders and saved bag.')) return;
  if(!confirm('Are you absolutely sure? This cannot be undone.')) return;
  setBusy(true);
  try{
    await api('/auth/me',{method:'DELETE'});
    const key = getCartKey(user);
    localStorage.removeItem('uc_token');
    localStorage.removeItem('uc_user');
    localStorage.removeItem(key);
    localStorage.removeItem('uc_cart');
    setUser(null);
    setOrders([]);
    setCart([]);
    setAccountOpen(false);
    setNotice('Your account has been deleted.');
  }catch(e){ setAuthError(e.message); setNotice(e.message); }
  finally{ setBusy(false); }
 }

 function handleCheckoutClick(){
   if(!user){
     setCartOpen(false);
     setAccountOpen(true);
     setAuthMode('login');
     setAuthError('Please sign in or create an account before checkout.');
     setNotice('You must sign in before checkout');
     return;
   }
   setCartOpen(false);
   setCheckoutOpen(true);
   // Reset phone verification when opening checkout
   setPhoneVerified(false);
   setPhoneOtpSent(false);
   setPhoneOtp('');
   setOtpStatus('');
   setPhoneVerifiedToken('');
 }

 function closeTerms(){
  const cameFromSignup = termsFromSignup;
  setShowTerms(false);
  setTermsFromSignup(false);
  if(cameFromSignup){
    setTimeout(()=>{
      setAuthMode('register');
      setAccountOpen(true);
    }, 120);
  }
}

 async function placeOrder(e) {
  e.preventDefault();
  if(!user){ setAuthError('Please sign in first'); setAccountOpen(true); return; }
  if(!form.full_name.trim()||!form.email.trim()||!form.phone.trim()||!form.delivery_address.trim()||!form.province.trim()||!form.postal_code.trim()){
    setNotice('Please fill all: Full Name, Email, SA Phone, Delivery Address, Province, Postal Code'); return;
  }
  if(!isValidSAphone(form.phone)){ setNotice('Invalid SA phone. Use +27 71 234 5678 or 0712345678'); return; }
  if(!/^[0-9]{4}$/.test(form.postal_code.trim())){ setNotice('Postal code must be 4 digits (SA) e.g. 2196'); return; }
  if(!cart.length){ setNotice('Your bag is empty.'); return; }
  setBusy(true); setNotice('');
  try {
const order = await api('/orders',{method:'POST',body:JSON.stringify({
      phoneVerifiedToken: phoneVerifiedToken,
      full_name: form.full_name, customer_name: form.full_name, email: form.email, phone: form.phone,
      address_search: form.address_search, delivery_address: form.delivery_address, address: form.delivery_address,
      province: form.province, postal_code: form.postal_code, city: form.delivery_address, customer_id: user?.id,
      items: cart.map(p => ({ id: p.id, product_id: p.id, quantity: p.quantity, price: effectivePrice(p) }))
    })});
    const pay = await api('/payfast/checkout',{method:'POST',body:JSON.stringify({ orderId: order.orderId })});
    if (!pay.action || !pay.fields) throw new Error('PayFast is not configured yet on server');
localStorage.setItem('lastOrderId', order.orderId);
// BACKUP cart before leaving for PayFast - so we can restore on cancel
localStorage.setItem('uc_cart_backup', JSON.stringify(cart));
localStorage.setItem(getCartKey(user), JSON.stringify(cart));
const formEl = document.createElement('form'); formEl.method='POST'; formEl.action=pay.action; formEl.style.display='none';
    Object.entries(pay.fields).forEach(([name, value]) => { const input=document.createElement('input'); input.type='hidden'; input.name=name; input.value=String(value ?? ''); formEl.appendChild(input); });
    document.body.appendChild(formEl); setCheckoutOpen(false); formEl.submit();
  } catch (err) { setCheckoutError(err.message || 'Could not start PayFast checkout.'); } finally { setBusy(false); }
 }

 async function createProduct(e){
    e.preventDefault();
    try{
      const payload={...prodForm, images: prodForm.images.filter(Boolean).slice(0,4), price:Number(prodForm.price), sale_price: prodForm.sale_price?Number(prodForm.sale_price):null, stock:Number(prodForm.stock), on_sale: Boolean(prodForm.on_sale), is_active: Boolean(prodForm.is_active)};
      const p = await api('/admin/products',{method:'POST', body:JSON.stringify(payload)});
      setProducts(old=>[p,...old]); setNotice('Product created'); 
      setProdForm({name:'',category:'Tech',price:'',sale_price:'',on_sale:false,stock:'',description:'',image_url:'',images:['','','',''],is_active:true,unit:'none',unit_value:''});
    }catch(err){setNotice(err.message)}
  }
  async function saveEdit(e){
    e.preventDefault();
    try{
      const payload={...prodForm, images: prodForm.images.filter(Boolean).slice(0,4), price:Number(prodForm.price), sale_price: prodForm.sale_price?Number(prodForm.sale_price):null, stock:Number(prodForm.stock), on_sale: Boolean(prodForm.on_sale), is_active: Boolean(prodForm.is_active)};
      const p = await api(`/admin/products/${editingId}`,{method:'PUT', body:JSON.stringify(payload)});
      setProducts(old=>old.map(x=>x.id===editingId? p : x));
      setEditingId(null); setProdForm({name:'',category:'Tech',price:'',sale_price:'',on_sale:false,stock:'',description:'',image_url:'',images:['','','',''],is_active:true,unit:'none',unit_value:''}); setNotice('Product updated');
    }catch(err){setNotice(err.message)}
  }

  function startEdit(p){
    setEditingId(p.id);
    const extra = getProductImages(p).slice(1); // skip main image, keep extras
    setProdForm({
      name:p.name, 
      category:p.category||'Tech', 
      unit: p.unit || 'none',
      unit_value: p.unit_value || '',
      price:String(p.price), 
      sale_price: p.sale_price?String(p.sale_price):'', 
      on_sale: !!p.on_sale, 
      stock:String(p.stock), 
      description:p.description, 
      image_url:p.image_url, 
      images: [...extra, '','','',''].slice(0,4), // fill up to 4 slots
      is_active: p.is_active ?? true
    });
    setAdminTab('products');
  }

  async function deleteProduct(id){
    if(!confirm('Delete this product?')) return;
    try{ await api(`/admin/products/${id}`,{method:'DELETE'}); setProducts(old=>old.filter(x=>x.id!==id)); setNotice('Product deleted'); }catch(err){setNotice(err.message)}
  }
  async function toggleStock(p){
    try{
      const payload = isOutOfStock(p) ? {...p, is_active:true, stock:10} : {...p, is_active:false, stock:0};
      const updated = await api(`/admin/products/${p.id}`,{method:'PUT', body:JSON.stringify(payload)});
      setProducts(old=>old.map(x=>x.id===p.id?updated:x));
      setNotice(isOutOfStock(p) ? 'Product back in stock' : 'Marked out of stock');
    }catch(e){ setNotice(e.message); }
  }
  async function quickSaleToggle(p){
    try{
      const payload = {...p, on_sale: !p.on_sale};
      if(!payload.sale_price) payload.sale_price = Math.round(Number(p.price)*0.8);
      const updated = await api(`/admin/products/${p.id}`,{method:'PUT', body:JSON.stringify(payload)});
      setProducts(old=>old.map(x=>x.id===p.id?updated:x));
    }catch(e){ setNotice(e.message); }
  }

 async function showAdmin(){
   try{
     const ordersData=await api('/admin/orders');
     setAdminOrders(ordersData);
     try{
       const usersData=await api('/admin/users');
       setAdminUsers(usersData);
     }catch{ setAdminUsers([]); }
     setAdminOpen(true);
     setAdminTab('dashboard');
   }catch(e){setNotice(e.message);}
 }
 // === FIX B: updateStatus with safe mapping + amber catch ===
 async function updateStatus(id,status){
   if(status==='cancelled'){ setCancelModal(id); return; }
   const safeStatus = toSafeStatus(status);
   try{
     await api(`/admin/orders/${id}/status`,{method:'PATCH',body:JSON.stringify({status: safeStatus})});
     setAdminOrders(old=>old.map(o=>o.id===id?{...o,status: safeStatus, delivery_status: safeStatus.charAt(0).toUpperCase()+safeStatus.slice(1)}:o));
     setNotice(`Order #${id} updated to ${safeStatus}`);
   }catch(e){
     // fallback try refund endpoint if refund
     if(safeStatus==='refunded'){
       try{
         await api(`/admin/orders/${id}/refund`,{method:'POST', body:JSON.stringify({reason:'Admin refund'})});
         setAdminOrders(old=>old.map(o=>o.id===id?{...o,status:'refunded', payment_status:'refunded'}:o));
         setNotice(`Order #${id} refunded`);
         return;
       }catch{}
     }
     setNotice(`⚠️ ${e.message} (Hint: run fix_status_enum.sql)`);
   }
 }
 async function confirmCancel(){
   if(!cancelModal) return;
   if(!cancelReason.trim()){ setNotice('Please provide a reason for cancelling'); return; }
   try{
     await api(`/admin/orders/${cancelModal}/status`,{method:'PATCH',body:JSON.stringify({status:'cancelled', cancel_reason: cancelReason})});
     setAdminOrders(old=>old.map(o=>o.id===cancelModal?{...o,status:'cancelled', delivery_status:'Cancelled', cancel_reason: cancelReason}:o));
     setNotice(`Order #${cancelModal} cancelled. Reason: ${cancelReason}`);
     setCancelModal(null); setCancelReason('');
   }catch(e){ setNotice(e.message); }
 }
 async function issueRefund(id){
   if(!confirm(`Refund order #${id}? This will mark as refunded and you must refund via PayFast dashboard.`)) return;
   try{
     await api(`/admin/orders/${id}/refund`,{method:'POST', body:JSON.stringify({reason:'Admin refund'})});
     setAdminOrders(old=>old.map(o=>o.id===id?{...o,status:'refunded', payment_status:'refunded'}:o));
     setNotice(`Order #${id} refunded`);
   }catch(e){
     try{
       await api(`/admin/orders/${id}/status`,{method:'PATCH',body:JSON.stringify({status:'refunded'})});
       setAdminOrders(old=>old.map(o=>o.id===id?{...o,status:'refunded', payment_status:'refunded'}:o));
       setNotice(`Order #${id} marked as refunded (manual refund in PayFast)`);
     }catch(err){ setNotice(`⚠️ ${err.message}`); }
   }
 }
 async function blockUser(u){
   const action = u.is_blocked ? 'unblock' : 'block';
   if(!confirm(`${action.toUpperCase()} ${u.email}?`)) return;
   try{
     await api(`/admin/users/${u.id}/${action}`,{method:'PATCH'});
     setAdminUsers(old=>old.map(x=>x.id===u.id?{...x, is_blocked: !x.is_blocked}:x));
     setNotice(`${u.email} ${action}ed`);
   }catch(e){ setNotice(e.message); }
 }
 async function makeAdmin(u){
   const newRole = u.role==='admin' ? 'customer' : 'admin';
   if(!confirm(`Make ${u.email} ${newRole}?`)) return;
   try{
     await api(`/admin/users/${u.id}/role`,{method:'PATCH', body:JSON.stringify({role:newRole})});
     setAdminUsers(old=>old.map(x=>x.id===u.id?{...x, role:newRole}:x));
     setNotice(`${u.email} is now ${newRole}`);
   }catch(e){ setNotice(e.message); }
 }
 function messageUser(u){
   const msg = prompt(`Message to ${u.email} / ${u.phone||''}:`, `Hi ${u.name||''}, regarding your order...`);
   if(!msg) return;
   const wa = u.phone ? `https://wa.me/${String(u.phone).replace(/[^0-9]/g,'').replace(/^0/,'27')}?text=${encodeURIComponent(msg)}` : null;
   if(wa && confirm('Open WhatsApp?')) window.open(wa, '_blank');
   else window.location.href = `mailto:${u.email}?subject=Urban Cart - Your Order&body=${encodeURIComponent(msg)}`;
 }
 // === FIX D: saveTrackingUpdate never writes human label to status column ===
 async function saveTrackingUpdate(){
   if(!editingOrder) return;
   setBusy(true);
   const mappedStatus = STATUS_MAP[editData.delivery_status] || toSafeStatus(editData.delivery_status);
   const bodyForTracking = {
     delivery_status: editData.delivery_status,
     delivery_status_code: mappedStatus,
     current_location: editData.current_location,
     eta: editData.eta,
     tracking_note: editData.tracking_note,
     status: mappedStatus // server should ignore for tracking-only endpoint
   };
   const bodyForStatus = {
     delivery_status: editData.delivery_status,
     current_location: editData.current_location,
     eta: editData.eta,
     tracking_note: editData.tracking_note,
     status: mappedStatus
   };
   try{
     // Try dedicated tracking endpoint first (safe, never touches status ENUM with label)
     try{
       await api(`/admin/orders/${editingOrder.id}/tracking`,{method:'PUT', body:JSON.stringify(bodyForTracking)});
       setNotice(`Tracking updated for Order #${editingOrder.id} → ${editData.delivery_status} (mapped to ${mappedStatus})`);
       setEditingOrder(null);
       showAdmin();
       return;
     }catch(_e){
       // fallback to PUT /admin/orders/:id which server now treats as tracking-only
       await api(`/admin/orders/${editingOrder.id}`,{method:'PUT', body:JSON.stringify(bodyForStatus)});
       setNotice(`Tracking updated for Order #${editingOrder.id}`);
       setEditingOrder(null);
       showAdmin();
     }
   }catch(e){
     setNotice(`⚠️ ${e.message} — Tip: Check fix_status_enum.sql for DB ENUM fix`);
   } finally { setBusy(false); }
 }
 function printInvoice(o, type='invoice'){
   const itemsHtml = (o.items||[]).map(it=>`<tr><td>${it.name}</td><td style="text-align:center">${it.quantity}</td><td style="text-align:right">${fmt(it.price)}</td><td style="text-align:right">${fmt(Number(it.price)*Number(it.quantity))}</td></tr>`).join('');
   const html = `
   <html><head>
   <link rel="icon" type="image/png" href="/favicon.png" />
 <link rel="icon" type="image/png" href="https://i.im.ge/QQwblAT/urban-cart-logo-cutout.png" />
<title>${type.toUpperCase()} #${o.id}</title>
   <style>body{font-family:monospace;padding:32px;color:#121212}h1{font-family:Anton,sans-serif;font-size:32px;margin:0} table{width:100%;border-collapse:collapse;margin-top:16px} td,th{border:1px solid #121212;padding:8px;font-size:12px} .head{display:flex;justify-content:space-between;border-bottom:3px solid #121212;padding-bottom:12px}</style>
   </head><body>
   <div class="head"><div><h1>URBAN CART</h1><small>Ellisras — Lephalale — SA<br/>PayFast Secure</small></div><div style="text-align:right"><b>${type.toUpperCase()}</b><br/>#${o.id}<br/>${new Date(o.created_at).toLocaleDateString()}<br/>${o.status.toUpperCase()} / ${(o.payment_status||'paid').toUpperCase()}</div></div>
   <div style="display:flex;gap:40px;margin-top:20px"><div><b>BILL TO:</b><br/>${o.customer_name||o.full_name}<br/>${o.email}<br/>${o.phone}<br/>${o.delivery_address||o.address}<br/>${o.province}, ${o.postal_code}</div><div><b>${type==='invoice'?'SHIP TO:':'DELIVERY:'}</b><br/>${o.delivery_address||o.address}<br/>${o.province}<br/>Courier: ${o.current_location||'Warehouse Lephalale'}<br/>ETA: ${o.eta||'2-3 days'}</div></div>
   <table><thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead><tbody>${itemsHtml}</tbody><tfoot><tr><td colspan="3" style="text-align:right"><b>TOTAL</b></td><td style="text-align:right"><b>${fmt(o.total)}</b></td></tr></tfoot></table>
   ${type==='delivery' ? `<div style="margin-top:40px;border:2px dashed #121212;padding:16px"><b>DELIVERY NOTE:</b><br/>Order #${o.id} — Handle with care. Customer phone: ${o.phone}. Signature required. ${o.cancel_reason?'<br/>NOTE: '+o.cancel_reason:''}</div>` : ''}
   <p style="font-size:10px;margin-top:32px">Generated by Urban Cart Admin — ${new Date().toLocaleString()}</p>
   </body></html>`;
   printDoc(html);
 }

 const filteredOrders = useMemo(()=>{
   if(orderFilter==='all') return adminOrders;
   if(orderFilter==='new') return adminOrders.filter(o=>['pending','paid'].includes(o.status) && (Date.now() - new Date(o.created_at).getTime()) < 1000*60*60*24);
   if(orderFilter==='paid') return adminOrders.filter(o=>o.payment_status==='paid' || o.status==='paid');
   if(orderFilter==='failed') return adminOrders.filter(o=>o.payment_status==='failed');
   if(orderFilter==='cancelled') return adminOrders.filter(o=>o.status==='cancelled');
   return adminOrders.filter(o=>o.status===orderFilter);
 },[adminOrders, orderFilter]);

 const filteredUsers = useMemo(()=>{
   if(!userSearch) return adminUsers;
   return adminUsers.filter(u=> `${u.name} ${u.email} ${u.phone||''}`.toLowerCase().includes(userSearch.toLowerCase()));
 },[adminUsers, userSearch]);

 // === FIX A: handle forgot password ===
 async function handleForgot(e){
   e?.preventDefault();
   if(!forgotEmail.trim()){ setForgotMessage('Enter your email'); return; }
   setBusy(true); setForgotMessage('Sending...');
   try{
     const data = await api('/auth/forgot-password',{method:'POST', body:JSON.stringify({email: forgotEmail})});
     setForgotMessage(data.message || 'Reset link sent! Check your inbox.');
     setTimeout(()=>{ setForgotOpen(false); setForgotMessage(''); }, 3000);
   }catch(err){
     // fallback if endpoint 404
     if(err.message.includes('404') || err.message.includes('Request failed')){
       setForgotMessage('Password reset: Contact support at support@urbancart.co.za or use email link. Your email will receive reset instructions. (Sandbox: check server logs for token)');
       setTimeout(()=>{ setForgotOpen(false); setForgotMessage(''); }, 4000);
     } else {
       setForgotMessage(err.message);
     }
   } finally { setBusy(false); }
 }

 async function handleResetPassword(e){
  e?.preventDefault();
  if(!newPassword || newPassword.length < 6){
    setResetMessage('Password must be at least 6 characters');
    return;
  }
  setBusy(true); setResetMessage('Resetting...');
  try{
    const data = await api('/auth/reset-password', {
      method:'POST', 
      body: JSON.stringify({ token: resetToken, newPassword })
    });
    setResetMessage(data.message || 'Password reset! You can now login.');
    setTimeout(()=>{
      setResetOpen(false);
      setResetToken(null);
      setNewPassword('');
      setResetMessage('');
      window.history.replaceState({}, '', window.location.pathname); // clean URL
      setAuthMode('login');
    }, 2000);
  }catch(err){
    setResetMessage(err.message || 'Invalid or expired link');
  }finally{
    setBusy(false);
  }
}

 return <div className="app">
  <div className="ticker"><div className="ticker-track"><span>● FREE DELIVERY OVER R1,000 ● SECURE PAYFAST ● CURATED IN SA ● EVERYDAY ELEVATED ●</span><span>● FREE DELIVERY OVER R1,000 ● SECURE PAYFAST ● CURATED IN SA ● EVERYDAY ELEVATED ●</span></div></div>
  <header className="header">
    <div className="header-left">
      <button className="icon-btn mobile-only" onClick={()=>setMenuOpen(!menuOpen)}><Menu size={20}/></button>
      <a className="brand" href="#" onClick={()=>{setCategory('All');setSearch('');closeProduct();setShowAll(false); setActiveTab('shop');}}>
        <img src="https://i.im.ge/QQwblAT/urban-cart-logo-cutout.png" alt="Urban Cart" style={{height:38, width:'auto', objectFit:'contain'}} />
        URBAN CART <i>®</i>
      </a>
      <nav className={menuOpen?'nav open':'nav'}>
        <button className="nav-close" onClick={()=>setMenuOpen(false)} aria-label="Close menu"><X size={24}/></button>
        <a onClick={()=>{handleHome(); setMenuOpen(false);}}>HOME</a>
        <a onClick={()=>{handleViewEverything(); setMenuOpen(false);}}>INDEX</a>
        {hasOrders && <a onClick={()=>{setActiveTab('track'); loadTracking(); setMenuOpen(false);}}>TRACK ORDER</a>}
        <a href="#story" onClick={()=>setMenuOpen(false)}>MANIFESTO</a>
      </nav>
    </div>
    <div className="header-right">
      <label className="search-pill desktop-search"><Search size={14}/><input value={search} onChange={e=>{setSearch(e.target.value); if(selectedProduct){closeProduct()}}} placeholder="SEARCH"/><kbd>⌘K</kbd></label>
      <button className="circle-btn mobile-search-btn" onClick={()=>setSearchOpen(!searchOpen)}><Search size={16}/></button>
      <button className="circle-btn" onClick={()=>setAccountOpen(true)}><UserRound size={16}/></button>
      <button className="bag-pill" onClick={()=>setCartOpen(true)}><ShoppingBag size={14}/> BAG <b>{count}</b></button>
    </div>
  </header>
  {/* === FIX C: Mobile search synced === */}
  {searchOpen && <div className="mobile-search-overlay show">
    <input autoFocus value={search} onChange={e=>{setSearch(e.target.value); setCategory('All'); if(selectedProduct) closeProduct(); setActiveTab('shop');}} placeholder="Search products..."/>
    <button onClick={()=>setSearchOpen(false)}><X size={16}/></button>
  </div>}
  <main>
    {activeTab==='track' ? (
      <section className="shop">
        <div className="shop-head"><h2>MY ORDERS & TRACKING</h2><button className="btn-ghost" onClick={()=>setActiveTab('shop')}>BACK TO SHOP</button></div>
        {!trackingOrders.length && <div className="empty">No orders yet - <button onClick={()=>setActiveTab('shop')}>Start shopping</button></div>}
        {[...trackingOrders].sort((a,b)=> new Date(b.created_at) - new Date(a.created_at)).map(o=>(
          <div key={o.id} style={{border:'2px solid #121212', marginBottom:16, background:'#FFFCF8'}}>
            <div style={{padding:14, borderBottom:'2px solid #121212', display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:8}}>
              <b>Order #{o.id} - {fmt(o.total)} - <span style={{background: o.status==='cancelled' ? '#ff3b30' : o.payment_status==='failed' ? '#F59E0B' : '#121212', color:'#fff', padding:'2px 6px'}}>{o.cancel_reason ? `Cancelled: ${o.cancel_reason}` : (o.payment_status ? `${o.payment_status.toUpperCase()} / ` : '') + (o.delivery_status || o.status)}</span></b>
              <span style={{fontSize:11}}>{new Date(o.created_at).toLocaleDateString()} • {o.province} {o.postal_code}</span>
            </div>
            <div style={{padding:14}}>
              <p style={{fontSize:12}}><MapPin size={12} style={{display:'inline'}}/> <b>Deliver to:</b> {o.delivery_address}, {o.province}, {o.postal_code}</p>
              <p style={{fontSize:12}}><Truck size={12} style={{display:'inline'}}/> <b>Current:</b> {o.current_location} | <Clock size={12} style={{display:'inline'}}/> <b>ETA:</b> {o.eta}</p>
              <div style={{marginTop:14, borderLeft:'3px solid #121212', paddingLeft:14}}>
                {(o.tracking_history||[]).map((h,i)=>(
                  <div key={i} style={{marginBottom:12, position:'relative'}}>
                    <div style={{width:12, height:12, background:'#121212', position:'absolute', left:-21, top:3, borderRadius:'50%'}}></div>
                    <b style={{fontSize:13}}>{h.status}</b> <span style={{fontSize:10, opacity:.6, marginLeft:6}}>{new Date(h.time).toLocaleString()}</span>
                    <p style={{fontSize:11, margin:'4px 0'}}>{h.location} {h.eta ? ` - ETA: ${h.eta}`:''}</p>
                    {h.note && <p style={{fontSize:11, fontStyle:'italic', background:'#fff', border:'1px dashed #121212', padding:6, margin:'4px 0 0'}}>"{h.note}"</p>}
                  </div>
                ))}
              </div>
              <div style={{marginTop:14}}>
                {o.items?.map((it, idx)=><div key={idx} style={{fontSize:11, borderTop:'1px solid #ddd', padding:'8px 0', display:'flex', gap:8, alignItems:'center'}}><img src={it.image_url || it.image} style={{width:48,height:48,objectFit:'cover', border:'1px solid #121212'}}/><span>{it.name} x {it.quantity} - {fmt(it.price)}</span></div>)}
              </div>
              <div style={{marginTop:12, display:'flex', gap:8}}>
                <button className="btn-ghost" style={{height:36, fontSize:11}} onClick={()=>printInvoice(o,'invoice')}><Printer size={12}/> INVOICE</button>
                <button className="btn-ghost" style={{height:36, fontSize:11}} onClick={()=>printInvoice(o,'delivery')}><FileText size={12}/> DELIVERY NOTE</button>
              </div>
            </div>
          </div>
        ))}
      </section>
        ) : selectedProduct ? (
          <>
          <div className="product-view">
            <div className="product-view-left" style={{display:'flex', flexDirection:'column', gap:12}}>
            {getProductImages(selectedProduct).map((img, i) => (
              <img key={i} src={img} alt={`${selectedProduct.name} - ${i+1}`} style={{width:'100%', display:'block', border:'2px solid #121212', background:'#fff'}} />
            ))}
            <div className="img-meta" style={{position:'static'}}><span>{selectedProduct.category} {selectedProduct.on_sale && <b style={{background:'#F59E0B', color:'#000', padding:'2px 6px', marginLeft:8}}>SALE</b>}</span><span>{isOutOfStock(selectedProduct) ? 'OUT OF STOCK' : `${selectedProduct.stock} IN STOCK`}</span></div>
          </div>
        <div className="product-view-right">
          <button className="close-view" onClick={closeProduct}><X size={14}/> CLOSE</button>
          <h1>{selectedProduct.name}</h1>
          <p className="desc">{selectedProduct.description}</p>
          <div className="price-row" style={{flexDirection:'column', alignItems:'flex-start', gap:4}}>
            {selectedProduct.on_sale ? <>
              <span style={{fontSize:11, fontWeight:700, letterSpacing:1, opacity:.6}}>WAS <span style={{textDecoration:'line-through'}}>{fmt(selectedProduct.price)}</span></span>
              <span style={{fontSize:11, fontWeight:700, letterSpacing:1, color:'#92400E'}}>NOW <strong style={{fontSize:22, color:'#92400E'}}>{fmt(effectivePrice(selectedProduct))}</strong></span>
            </> : <>
              <span style={{fontSize:11, fontWeight:700, letterSpacing:1}}>PRICE</span>
              <strong style={{fontSize:22}}>{fmt(effectivePrice(selectedProduct))}</strong>
            </>}
            <span style={{fontSize:11}}>ZAR • VAT INCL. {selectedProduct.on_sale && <span style={{background:'#F59E0B', color:'#fff', padding:'2px 6px', marginLeft:6}}>SAVE {fmt(Number(selectedProduct.price) - Number(effectivePrice(selectedProduct)))}</span>}</span>
          </div>
          <div className="buy-row">
            <button className="btn-black" disabled={isOutOfStock(selectedProduct)} onClick={()=>{
              if(selectedProduct.unit==='size' && !selectedSize){
                setNotice('Please select a size first');
                return;
              }
              add({...selectedProduct, selectedSize: selectedProduct.unit==='size' ? selectedSize : null});
            }} style={{opacity: isOutOfStock(selectedProduct)?0.4:1}}>
              {isOutOfStock(selectedProduct) ? 'OUT OF STOCK' : `ADD TO BAG — ${fmt(effectivePrice(selectedProduct))}`} <ArrowUpRight size={16}/>
            </button>
            <button className="btn-ghost" onClick={()=>setCartOpen(true)}>View bag ({count})</button>
          </div>
          {/* MINI ACCESSORIES - under checkout */}
            {products.filter(p => p.id !== selectedProduct.id && p.category?.toLowerCase() === 'accessories').length > 0 && (
              <div style={{marginTop:14, borderTop:'1px solid #E5DDD0', paddingTop:10}}>
                <div style={{fontSize:9, fontWeight:800, letterSpacing:1.2, opacity:0.55, marginBottom:8}}>COMPLETE IT — ACCESSORIES</div>
                <div style={{display:'flex', flexDirection:'column', gap:6}}>
                  {products.filter(p => p.id !== selectedProduct.id && p.category?.toLowerCase() === 'accessories').slice(0, 3).map(p => {
                    const img = getProductImages(p)[0] || p.image_url;
                    return (
                      <div key={p.id} style={{display:'flex', alignItems:'center', gap:8, cursor:'pointer'}} onClick={()=>{ openProduct(p); window.scrollTo({top:0, behavior:'smooth'}); }}>
                        <img src={img} alt={p.name} style={{width:36, height:36, objectFit:'cover', border:'1px solid #121212', flexShrink:0}} />
                        <div style={{flex:1, minWidth:0}}>
                          <div style={{fontSize:11, fontWeight:700, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{p.name}</div>
                          <div style={{fontSize:11, opacity:0.7}}>{fmt(effectivePrice(p))}</div>
                        </div>
                        <button onClick={(e)=>{ e.stopPropagation(); add(p); }} style={{fontSize:10, fontWeight:800, background:'#121212', color:'#fff', border:'none', padding:'6px 8px', cursor:'pointer', flexShrink:0}}>+ ADD</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          <div className="micro-badges">
            <span><Truck size={14}/> 1-2 DAY DELIVERY</span>
            <span><ShieldCheck size={14}/> PAYFAST SECURE</span>
            <span><RotateCcw size={14}/> 5-DAY RETURNS</span>
          </div>
        </div>
      </div>
      {/* YOU MIGHT LIKE */}
        <div style={{padding:'24px', background:'#FFFCF8', borderTop:'2px solid #121212'}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16}}>
            <h3 style={{fontFamily:'Anton, sans-serif', fontSize:22, margin:0, letterSpacing:1}}>YOU MIGHT LIKE</h3>
            <span style={{fontSize:11, letterSpacing:1, opacity:0.6}}>MORE {selectedProduct.category?.toUpperCase()}</span>
          </div>
          <div className="you-might-like-grid" style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:12}}>
            {(() => {
              const sameCat = products.filter(p => p.id !== selectedProduct.id && p.category === selectedProduct.category);
              const others = products.filter(p => p.id !== selectedProduct.id && p.category !== selectedProduct.category);
              const picks = [...sameCat, ...others].slice(0, 4);
              return picks.map(p => {
                const imgs = getProductImages(p);
                return (
                  <div key={p.id} onClick={()=>{ openProduct(p); window.scrollTo({top:0, behavior:'smooth'}); }} style={{cursor:'pointer', background:'#fff', border:'2px solid #121212'}}>
                    <div style={{aspectRatio:'1/1', overflow:'hidden', background:'#EDE7DF'}}>
                      <img src={imgs[0]} alt={p.name} style={{width:'100%', height:'100%', objectFit:'cover', display:'block'}} />
                    </div>
                    <div style={{padding:10}}>
                      <div style={{fontSize:11, fontWeight:700, textTransform:'uppercase', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{p.name}</div>
                      <div style={{fontSize:10, opacity:0.6, margin:'2px 0 6px'}}>{p.category}</div>
                      <div style={{display:'flex', alignItems:'center', gap:6}}>
                        {p.on_sale && <span style={{fontSize:11, textDecoration:'line-through', opacity:0.5}}>{fmt(p.price)}</span>}
                        <strong style={{fontSize:14}}>{fmt(effectivePrice(p))}</strong>
                        {p.on_sale && <span style={{fontSize:9, background:'#F59E0B', color:'#000', padding:'2px 4px', fontWeight:800}}>SAVE {fmt(Number(p.price) - Number(effectivePrice(p)))}</span>}
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
        </>
    ) : showAll ? (
      <section className="shop">
        <div className="shop-head">
          <h2>FULL INDEX <span>({visibleAll.length})</span></h2>
          <button className="btn-ghost" onClick={()=>{setShowAll(false); window.scrollTo(0,0)}}><X size={14}/> BACK TO HOME</button>
        </div>
        <div className="grid all-mode">
          {visibleAll.map((p)=>
            <article key={p.id} className="card" onClick={()=>openProduct(p)} style={{opacity: isOutOfStock(p)?0.6:1}}>
              <div className="card-img"><img src={p.image_url} alt={p.name} loading="lazy"/><span className="tag">{isOutOfStock(p)?'OUT OF STOCK': p.on_sale?'SALE':p.category}</span><button className="add" onClick={e=>{e.stopPropagation(); add(p);}} disabled={isOutOfStock(p)}><Plus size={16}/></button></div>
              <div className="card-info"><div><h3>{p.name}</h3><small>{p.category}</small></div><div style={{textAlign:'right', lineHeight:1.2}}>{p.on_sale?<><small style={{fontSize:9, fontWeight:700, opacity:.6}}>WAS <span style={{textDecoration:'line-through'}}>{fmt(p.price)}</span></small><br/><small style={{fontSize:9, fontWeight:700, color:'#92400E'}}>NOW</small> <b style={{color:'#92400E'}}>{fmt(effectivePrice(p))}</b></>:<><small style={{fontSize:9, fontWeight:700, opacity:.6}}>PRICE</small><br/><b>{fmt(p.price)}</b></>}</div></div>
            </article>
          )}
        </div>
      </section>
    ) : (
      <>
        <section className="hero-grid">
          <div className="hero-manifesto">
            <h1>FIND<br/>YOUR<br/>KIND<br/><em>OF GOOD.</em></h1>
            <div className="hero-actions">
              <a href="#shop" className="btn-black">SHOP THE INDEX <ArrowUpRight size={16}/></a>
            </div>
          </div>
          <div className="hero-cards">
            <div className="hero-big-card">
              <video autoPlay muted loop playsInline poster="https://images.unsplash.com/photo-1490312278390-ab64016e0aa9?auto=format&fit=crop&w=1200&q=85" style={{width:"100%",height:"100%",objectFit:"cover"}}>
                <source src="https://videos.pexels.com/video-files/18069234/18069234-uhd_1440_1440_24fps.mp4" type="video/mp4"/>
              </video>
              <div className="card-overlay"><span>THE NEW STANDARD</span><strong>Little things.<br/>Big difference.</strong></div>
            </div>
            <div className="hero-small-cards">
              <div className="mini-card"><PackageCheck size={18}/><strong>CURATED</strong><small>Not everything. Just the good stuff.</small></div>
              <div className="mini-card dark"><Truck size={18}/><strong>DELIVERED</strong><small>Tracked across SA. No surprises.</small></div>
            </div>
          </div>
        </section>
        <section id="shop" className="shop">
          <div className="shop-head">
            <h2>INDEX <span>({visible.length})</span></h2>
            <div className="tabs">
              {categories.map(c=><button key={c} className={category===c?'active':''} onClick={()=>setCategory(c)}>{c.toUpperCase()}</button>)}
            </div>
            <button className="view-all" onClick={()=>{handleViewEverything()}}>VIEW EVERYTHING <ArrowUpRight size={14}/></button>
          </div>
          {loading&&<div className="loading">LOADING INDEX...</div>}
          {!loading&&!visible.length&&<div className="empty">NO RESULTS FOR "{search}" <button onClick={()=>{setSearch('');setCategory('All')}}>CLEAR</button></div>}
          <div className="grid">
            {visible.map((p,i)=>
              <article key={p.id} className={i===0?"card big":"card"} onClick={()=>openProduct(p)} style={{opacity: isOutOfStock(p)?0.55:1}}>
                <div className="card-img"><img src={p.image_url} alt={p.name} loading="lazy"/><span className="tag" style={{background: isOutOfStock(p)?'#ff3b30': p.on_sale?'#F59E0B':undefined, color: isOutOfStock(p)||p.on_sale?'#fff':undefined}}>{isOutOfStock(p)?'OUT OF STOCK': i===0?'BESTSELLER': p.on_sale?'SALE':p.category}</span><button className="add" onClick={e=>{e.stopPropagation(); add(p);}} disabled={isOutOfStock(p)}><Plus size={16}/></button></div>
                <div className="card-info"><div><h3>{p.name}</h3><small>{p.category}</small></div><div style={{textAlign:'right', lineHeight:1.2}}>{p.on_sale?<><small style={{fontSize:9, fontWeight:700, opacity:.6}}>WAS <span style={{textDecoration:'line-through'}}>{fmt(p.price)}</span></small><br/><small style={{fontSize:9, fontWeight:700, color:'#92400E'}}>NOW</small> <b style={{color:'#92400E'}}>{fmt(effectivePrice(p))}</b></>:<><small style={{fontSize:9, fontWeight:700, opacity:.6}}>PRICE</small><br/><b>{fmt(p.price)}</b></>}</div></div>
              </article>
            )}
          </div>
        </section>
        <section id="story" className="manifesto">
          <div><h2>LESS NOISE.<br/>MORE<br/><em>MEANING.</em></h2></div>
          <div><p>Urban Cart started with one question: what if we only sold things we'd keep?</p><p>We don't do 10,000 products. We do 30 that matter. Tech that doesn't shout. Homeware that lasts. Everyday stuff that makes the day feel a little more considered.</p><p>Proudly built in Ellisras. Shipping everywhere in South Africa.</p><a onClick={()=>{setTermsTab('Terms of service'); setShowTerms(true);}} className="btn-outline" style={{cursor:'pointer'}}>READ OUR RULES <ArrowUpRight size={14}/></a></div>
        </section>
      </>
    )}
  </main>
  <footer className="footer">
    <div className="foot-top"><span>© {new Date().getFullYear()} URBAN CART</span><span>Ellisras — Lephalale — SA</span><span onClick={()=>{setTermsTab('Shipping'); setShowTerms(true);}} style={{cursor:'pointer', textDecoration:'underline'}}>TERMS & POLICIES</span></div>
    <div className="foot-big">URBAN CART</div>
  </footer>
  {notice&&<div className="toast"><Check size={14}/>{notice}<button onClick={()=>setNotice('')}><X size={12}/></button></div>}

  {cartOpen&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setCartOpen(false)}}>
    <aside className="drawer">
      <div className="drawer-head"><h2>BAG ({count})</h2><button onClick={()=>setCartOpen(false)}><X size={16}/></button></div>
      {!cart.length?<div className="empty-bag"><ShoppingBag size={28}/><h3>Bag is empty.</h3><p>Go add some good stuff.</p><button className="btn-black" onClick={()=>setCartOpen(false)}>SHOP NOW</button></div>:
      <>
        <div className="cart-list">{cart.map(p=><div key={p.id} className="cart-item"><img src={p.image_url}/><div>
          <h4>{p.name} {p.on_sale&&<span style={{background:'#F59E0B',fontSize:8,padding:'2px 4px'}}>SALE</span>}</h4>
          {p.unit && p.unit !== 'none' && (
            p.unit === 'size' ? (
              <select value={p.selectedSize || ''} onChange={e=>changeSize(p.id, e.target.value)} style={{fontSize:11, padding:'4px 6px', border:'1px solid #121212', marginTop:4}}>
                {(p.unit_value || '').split(',').map(s => <option key={s.trim()} value={s.trim()}>{s.trim()}</option>)}
              </select>
            ) : (
              <div style={{fontSize:11, opacity:0.6}}>{p.unit_value}{p.unit} • {p.quantity * Number(p.unit_value || 0)}{p.unit} total</div>
            )
          )}
          {p.on_sale ? <div style={{fontSize:11}}><span style={{opacity:.6}}>WAS <span style={{textDecoration:'line-through'}}>{fmt(p.original_price||p.price)}</span></span> <b style={{color:'#92400E'}}>NOW {fmt(effectivePrice(p))}</b></div> : <b>{fmt(effectivePrice(p))}</b>}<div className="qty"><button onClick={()=>changeQty(p.id,-1)}><Minus size={10}/></button><span>{p.quantity}</span><button onClick={()=>changeQty(p.id,1)}><Plus size={10}/></button></div></div><button className="remove" onClick={()=>removeItem(p.id)}>REMOVE</button></div>)}
        </div>
        <div className="cart-foot">
          <div className="sum"><span>SUBTOTAL ({count} items)</span><b>{fmt(total)}</b></div>
          <button className="btn-black full" onClick={handleCheckoutClick}>CHECKOUT — {fmt(total)} <ArrowUpRight size={14}/></button>
          {!user && <p style={{fontSize:11, color:'#ff3b30', textAlign:'center', marginTop:8}}>⚠ You must sign in to checkout</p>}
          {/* MINI ACCESSORIES - under checkout */}
            {(() => {
              const picks = products.filter(p => 
                p.category?.toLowerCase() === 'accessories' &&
                !cart.some(c => c.id === p.id) // don't show what's already in bag
              ).slice(0, 3);
              if (!picks.length) return null;
              return (
                <div style={{marginTop:14, borderTop:'1px solid #E5DDD0', paddingTop:10}}>
                  <div style={{fontSize:9, fontWeight:800, letterSpacing:1.2, opacity:0.55, marginBottom:8}}>COMPLETE IT — ACCESSORIES</div>
                  <div style={{display:'flex', flexDirection:'column', gap:6}}>
                    {picks.map(p => {
                      const img = getProductImages(p)[0] || p.image_url;
                      return (
                        <div key={p.id} style={{display:'flex', alignItems:'center', gap:8, cursor:'pointer'}} onClick={()=>{ setCartOpen(false); openProduct(p); window.scrollTo({top:0, behavior:'smooth'}); }}>
                          <img src={img} alt={p.name} style={{width:36, height:36, objectFit:'cover', border:'1px solid #121212', flexShrink:0}} />
                          <div style={{flex:1, minWidth:0}}>
                            <div style={{fontSize:11, fontWeight:700, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{p.name}</div>
                            <div style={{fontSize:11, opacity:0.7}}>{fmt(effectivePrice(p))}</div>
                          </div>
                          <button onClick={(e)=>{ e.stopPropagation(); add(p); }} style={{fontSize:10, fontWeight:800, background:'#121212', color:'#fff', border:'none', padding:'6px 8px', cursor:'pointer', flexShrink:0}}>+ ADD</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          <button className="btn-ghost full" style={{marginTop:8}} onClick={clearCart}>CLEAR BAG</button>
        </div>
      </>}
    </aside>
  </div>}

  {checkoutOpen&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setCheckoutOpen(false)}}>
    <section className="modal" style={{maxWidth:560, width:'94vw'}}>
      <div className="drawer-head"><h2>DELIVERY DETAILS</h2><button onClick={()=>setCheckoutOpen(false)}><X size={16}/></button></div>
      {!user && (
        <div style={{background:'#ff3b30', color:'#fff', padding:12, marginBottom:12, fontSize:12, fontWeight:700, textAlign:'center'}}>
          PLEASE SIGN IN FIRST - <button onClick={()=>{setCheckoutOpen(false); setAccountOpen(true);}} style={{background:'#fff', color:'#121212', border:'none', padding:'4px 10px', fontWeight:700, marginLeft:6, cursor:'pointer'}}>SIGN IN / SIGN UP</button>
        </div>
      )}
      {checkoutError && <div className="checkout-error" style={{background:'#FEF3C7', border:'2px solid #F59E0B', color:'#92400E', padding:'10px 12px', fontSize:11, fontWeight:700, marginBottom:12, textAlign:'center', borderRadius:4}}>{checkoutError}</div>}
      <form onSubmit={placeOrder} className="checkout-form" style={{display:'flex', flexDirection:'column', gap:12}}>
        <div><label style={{fontSize:11, fontWeight:700}}>Full Name *</label><input required value={form.full_name} onChange={e=>setField('full_name',e.target.value)} style={{width:'100%', height:44, border:'2px solid #121212', padding:'0 12px', marginTop:4}}/></div>
        <div>
          <label style={{fontSize:11, fontWeight:700, display:'flex', justifyContent:'space-between'}}>
            <span>Phone number *</span>
            <span style={{fontWeight:400, opacity:.6}}>SA only</span>
            </label>
            <div style={{display:'flex', border:'2px solid #121212', borderBottom:'3px solid #121212', height:44, marginTop:4}}>
            <span style={{background:'#eee', padding:'0 10px', display:'grid', placeItems:'center', fontSize:12, fontWeight:700, borderRight:'2px solid #121212'}}>ZA +27</span>
            <input required type="tel" inputMode="numeric" pattern="[0-9+]*" autoComplete="tel" value={form.phone} onChange={e=>setField('phone',e.target.value.replace(/[^0-9+]/g,''))} placeholder="082 000 0000" style={{flex:1, border:'none', outline:'none', padding:'0 12px', fontSize:13, fontWeight:600}}/>
          </div>
          <div style={{height:2, background:'#121212', marginTop:0}}></div>
        </div>
        <div style={{display:'flex', gap:'8px', marginTop:'8px'}}>
          <button type="button" onClick={sendPhoneOtp} disabled={phoneVerified} className="btn-outline">
            {phoneVerified ? '✓ Verified' : phoneOtpSent ? 'Resend OTP' : 'Send OTP'}
          </button>
        </div>

        {phoneOtpSent && !phoneVerified && (
          <div style={{display:'flex', gap:'8px', marginTop:'8px'}}>
            <input type="tel" inputMode="numeric" pattern="[0-9]*" autoComplete="one-time-code" value={phoneOtp} onChange={e=>setPhoneOtp(e.target.value.replace(/[^0-9]/g,'').slice(0,6))} placeholder="Enter 6-digit OTP" maxLength={6} style={{height:44, flex:1, border:'2px solid #121212', padding:'0 12px', fontSize:16, fontWeight:700, letterSpacing:4, textAlign:'center'}} />
            <button type="button" onClick={verifyPhoneOtp} className="btn-black">Verify</button>
          </div>
        )}
        {otpStatus && <div style={{fontSize:'12px', marginTop:'6px', padding:'6px', background:'#FEF3C7', borderRadius:'6px'}}>{otpStatus}</div>}
        <div><label style={{fontSize:11, fontWeight:700}}>Delivery address *</label>
        <input value={form.delivery_address} onChange={e=>setField('delivery_address',e.target.value)} placeholder="e.g. John Doe, 1234 Main Street, Apartment 56B, Springfield" style={{width:'100%', height:44, border:'2px solid #121212', padding:'0 12px', marginTop:4}}/></div>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
          <label>MEASURED IN
            <select value={prodForm.unit || 'none'} onChange={e=>setProdForm(f=>({...f, unit:e.target.value}))} style={{width:'100%', padding:10, border:'2px solid #121212'}}>
              <option value="none">No measurement</option>
              <option value="kg">Kilograms (kg)</option>
              <option value="g">Grams (g)</option>
              <option value="L">Litres (L)</option>
              <option value="ml">Millilitres (ml)</option>
              <option value="pcs">Pieces (pcs)</option>
              <option value="pack">Pack</option>
              <option value="pair">Pair</option>
              <option value="size">Size (S,M,L...)</option>
            </select>
          </label>
          {prodForm.unit !== 'none' && (
            <label>{prodForm.unit === 'size' ? 'SIZES - comma separated' : 'VALUE - e.g. 500'} 
              <input 
                value={prodForm.unit_value || ''} 
                onChange={e=>setProdForm(f=>({...f, unit_value:e.target.value}))} 
                placeholder={prodForm.unit === 'size' ? 'S,M,L,XL' : '500'} 
                style={{width:'100%', padding:10, border:'2px solid #121212'}} 
              />
            </label>
          )}
        </div>
        <div style={{border:'2px solid #121212', padding:12, background:'#FFFCF8'}}>
          <h4 style={{margin:'0 0 8px', fontFamily:'Anton', fontSize:13}}>PAYFAST SECURE</h4>
          <div style={{display:'flex', flexWrap:'wrap', gap:6, marginBottom:8}}>
            {['VISA','MasterCard','Capitec Pay','EFT Secure','Mobicred','SCode','Zapper'].map(m=><span key={m} style={{border:'1px solid #121212', padding:'4px 8px', fontSize:10, fontWeight:700, background:'#fff'}}>{m}</span>)}
          </div>
        </div>
        <div style={{display:'flex', justifyContent:'space-between', fontWeight:700, borderTop:'2px solid #121212', paddingTop:10, fontSize:13}}>
          <span>SUBTOTAL ({count} items)</span>
        <span>{fmt(total)}</span></div>
        <button 
            className="btn-black full" 
            disabled={busy || !user || !phoneVerified} 
            type="submit" 
            style={{
              height:48, 
              opacity: (!phoneVerified || !user) ? 0.5 : 1,
              cursor: (!phoneVerified || !user) ? 'not-allowed' : 'pointer'
            }}
          >
            {!user 
              ? 'SIGN IN TO PAY' 
              : !phoneVerified 
                ? 'VERIFY PHONE TO PAY' 
                : busy 
                  ? 'PREPARING...' 
                  : `PAY ${fmt(total)} WITH PAYFAST`
            } 
            <ShieldCheck size={14} style={{marginLeft:6}}/>
          </button>
          {!phoneVerified && user && (
            <div style={{fontSize:'11px', color:'#92400E', background:'#FEF3C7', padding:'8px', borderRadius:'6px', marginTop:'8px', textAlign:'center'}}>
              ⚠️ Verify your phone number with OTP before paying
            </div>
          )}
      </form>
    </section>
  </div>}

  {accountOpen&&<div className="overlay centered-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setAccountOpen(false)}}>
    <section className="modal auth-modal">
      <div className="drawer-head"><h2>{user?user.name.toUpperCase():authMode==='login'?'SIGN IN':'CREATE ACCOUNT'}</h2><button onClick={()=>setAccountOpen(false)}><X size={16}/></button></div>
      {user?<div className="account">
        <div className="avatar">{user.name[0]}</div><h3>{user.name}</h3><p>{user.email}</p>
        <div className="orders">
          {orders.slice(0,5).map(o=><div key={o.id} className="order-line"><span>#{o.id} • {new Date(o.created_at).toLocaleDateString()} • {o.delivery_status || o.status}</span><b>{fmt(o.total)} — {o.payment_status||o.status}</b></div>)}
          <button className="btn-ghost full" style={{marginTop:8}} onClick={()=>{setAccountOpen(false); setActiveTab('track'); loadTracking();}}>VIEW ALL & TRACK →</button>
        </div>
        <div className="centered-actions">
          <button className="btn-outline full" onClick={logout}>SIGN OUT</button>
          <button className="btn-ghost full delete-btn" onClick={deleteAccount} disabled={busy}>{busy?'DELETING...':'DELETE MY ACCOUNT'}</button>
        </div>
        {user.role==='admin'&&<button className="btn-black full" style={{marginTop:12}} onClick={()=>{setAccountOpen(false);showAdmin()}}>ADMIN DASHBOARD</button>}
      </div>:<>
        <div className="auth-switch centered-switch">
          <button className={authMode==='login'?'on':''} onClick={()=>{setAuthMode('login'); setAuthError('');}}>LOGIN</button>
          <button className={authMode==='register'?'on':''} onClick={()=>{setAuthMode('register'); setAuthError('');}}>SIGN UP</button>
        </div>
        {authError && <div className="auth-error">{authError}</div>}
        <form onSubmit={submitAuth} className="auth-form">
          {authMode==='register'&&<input required placeholder="Full name" value={authForm.name} onChange={e=>setAuthForm(f=>({...f,name:e.target.value}))}/>}
          <input required type="email" placeholder="Email" value={authForm.email} onChange={e=>setAuthForm(f=>({...f,email:e.target.value}))}/>
          <input required type="password" placeholder="Password" value={authForm.password} onChange={e=>setAuthForm(f=>({...f,password:e.target.value}))}/>
          {authMode==='login' && (
        <button 
          type="button" 
          className="forgot-link" 
          onClick={()=>{
            setAccountOpen(false); // ✅ CLOSE login modal first
            setTimeout(()=>{
              setForgotOpen(true); 
              setForgotEmail(authForm.email);
              setForgotStatus('');
            },150);
          }}
          style={{cursor:'pointer', background:'none', border:'none', color:'#c7b18e', textDecoration:'underline', fontSize:'13px', marginTop:'8px', alignSelf:'flex-start'}}
        >
          Forgot password?
        </button>
          )}
          {authMode==='register' && (<div className="terms-box"><label className="terms-check">
            <input type="checkbox" checked={authForm.acceptTerms} onChange={e=>setAuthForm(f=>({...f, acceptTerms:e.target.checked}))}/>
            <span>I agree to the 
              <button type="button" onClick={()=>{
              setTermsFromSignup(true);
              setAccountOpen(false);
              setTimeout(()=>{ setTermsTab('Terms of service'); setShowTerms(true); }, 120);
            }}  style={{textDecoration:'underline', background:'none', border:'none', fontWeight:700, cursor:'pointer'}}>Terms & Conditions</button></span></label></div>)}
          <button className="btn-black full" disabled={busy}>{busy?'WAIT...':authMode==='login'?'SIGN IN':'CREATE ACCOUNT'}</button>
        </form>
      </>}
    </section>
  </div>}

  {/* FORGOT PASSWORD MODAL */}
{forgotOpen && (
  <div className="modal-overlay" style={{zIndex:10020, position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', display:'flex', alignItems:'center', justifyContent:'center', padding:16}} onClick={()=>setForgotOpen(false)}>
    <div className="modal-box" onClick={e=>e.stopPropagation()} style={{maxWidth:'420px', width:'100%', background:'#FFFCF8', border:'2px solid #121212', borderRadius:0, boxShadow:'8px 8px 0 #121212', overflow:'hidden'}}>
      <div className="modal-head" style={{background:'#121212', padding:'18px 20px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <h3 style={{margin:0, color:'#E9D9BF', fontFamily:'Anton, sans-serif', fontSize:20, letterSpacing:1}}>RESET PASSWORD</h3>
        <button onClick={()=>setForgotOpen(false)} style={{background:'#FFFCF8', border:'none', width:30, height:30, fontWeight:900, cursor:'pointer', fontSize:14}}>✕</button>
      </div>
      <form onSubmit={handleForgotSubmit} style={{padding:'22px 20px', display:'flex', flexDirection:'column', gap:'14px'}}>
        <p style={{fontSize:'13px', color:'#57534E', lineHeight:'20px', margin:0}}>Enter your email — we'll send you a reset link <b style={{color:'#121212'}}>(expires in 1 hour)</b>. Check inbox & spam.</p>
        <label style={{fontSize:11, fontWeight:700, letterSpacing:1}}>EMAIL ADDRESS *</label>
        <input 
          type="email" 
          required 
          value={forgotEmail} 
          onChange={e=>setForgotEmail(e.target.value)}
          placeholder="your@email.com"
          style={{height:48, padding:'0 14px', border:'2px solid #121212', borderBottom:'3px solid #121212', background:'#fff', fontSize:14, fontWeight:600, outline:'none', width:'100%', boxSizing:'border-box'}}
        />
        <button type="submit" style={{height:48, background:'#121212', color:'#FFFCF8', border:'2px solid #121212', fontWeight:800, fontSize:13, letterSpacing:1, cursor:'pointer', fontFamily:'Anton, sans-serif'}}>SEND RESET LINK →</button>
        {forgotStatus && <div style={{fontSize:'12px', padding:'10px 12px', background: forgotStatus.includes('✅') ? '#F0FDF4' : '#FEF3C7', border:'1px solid #121212', borderLeft:'4px solid #121212', fontWeight:600}}>{forgotStatus}</div>}
        <p style={{fontSize:11, color:'#999', textAlign:'center', margin:0}}>Remember password? <button type="button" onClick={()=>{setForgotOpen(false); setAccountOpen(true);}} style={{background:'none', border:'none', textDecoration:'underline', fontWeight:700, cursor:'pointer'}}>Sign in</button></p>
      </form>
    </div>
  </div>
)}

{/* RESET PASSWORD MODAL */}
{resetOpen && (
  <div className="modal-overlay" style={{zIndex:10021}} onClick={()=>{setResetOpen(false); window.history.replaceState({}, '', '/');}}>
    <div className="modal-box" onClick={e=>e.stopPropagation()} style={{maxWidth:'400px'}}>
      <div className="modal-head">
        <h3>Set New Password</h3>
        <button onClick={()=>{setResetOpen(false); window.history.replaceState({}, '', '/');}} className="icon-x">✕</button>
      </div>
      <form onSubmit={handleResetSubmit} style={{padding:'16px', display:'flex', flexDirection:'column', gap:'12px'}}>
        <input 
          type="password" 
          required 
          minLength={6}
          value={resetPassword} 
          onChange={e=>setResetPassword(e.target.value)}
          placeholder="New password (min 6 chars)"
          style={{padding:'12px', border:'1px solid #ddd', borderRadius:'8px'}}
        />
        <button type="submit" className="btn-primary">Reset Password</button>
        {resetStatus && <div style={{fontSize:'13px', padding:'8px', background:'#FEF3C7', borderRadius:'6px'}}>{resetStatus}</div>}
      </form>
    </div>
  </div>
)}

{showTerms && (
  <div className="overlay" style={{zIndex:10030}} onMouseDown={e=>{if(e.target===e.currentTarget)closeTerms()}}>
    <section className="modal" style={{maxWidth:520, maxHeight:'85vh', overflow:'auto'}}>
      <div className="drawer-head"><h2>Terms and policies</h2><button onClick={()=>closeTerms()}><X size={16}/></button></div>

      <label style={{fontSize:11, fontWeight:700}}>Policy</label>
      <select value={termsTab} onChange={e=>setTermsTab(e.target.value)} style={{width:'100%', height:46, border:'2px solid #121212', padding:'0 12px', margin:'6px 0 14px', fontSize:14, fontWeight:600, background:'#fff'}}>
        <option>Shipping</option>
        <option>Refund policy</option>
        <option>Privacy policy</option>
        <option>Terms of service</option>
        <option>Contact</option>
      </select>

      <div style={{fontSize:13, lineHeight:1.7}}>
      {termsTab==='Shipping' && (
        <>
          <ul>
            <li>Orders are processed Monday to Friday within 5 business days</li>
            <li>You will receive a shipping confirmation email with tracking once your order has been dispatched</li>
            <li>Orders placed on weekends or holidays begin processing the next business day</li>
            <li>During peak periods, processing times may be slightly longer</li>
          </ul>
          <h3>Shipping Rates &amp; Delivery Times — South Africa</h3>
          <ul>
            <li>Standard Shipping: <b>R99</b></li>
            <li>Free Shipping: on orders over <b>R1,000</b></li>
            <li>Gauteng: 1-3 business days after processing</li>
            <li>Other Provinces: 2-5 business days</li>
            <li>Rural / Outlying: 3-7 business days</li>
          </ul>
          <p>Dispatched from Warehouse - Lephalale, Limpopo via Courier Guy / Pudo / PostNet.</p>
        </>
      )}

      {termsTab==='Refund policy' && (
        <>
          <p>Governed by the <b>Consumer Protection Act 68 of 2008 (CPA)</b> and <b>Electronic Communications and Transactions Act 25 of 2002 (ECTA)</b>.</p>
          <ul>
            <li><b>Cooling-off:</b> 7 days from delivery to cancel an online purchase in terms of ECTA s44, no reason needed</li>
            <li><b>Defective / not as described:</b> Return within 30 days, full refund in terms of CPA s56</li>
            <li><b>Refund time:</b> Within 14 days after we receive the return</li>
            <li>Items must be unused, in original packaging. Sale items can be returned if defective.</li>
            <li>To start a return, email gontsewamodise01@gmail.com with order #</li>
          </ul>
        </>
      )}

      {termsTab==='Privacy policy' && (
        <>
          <p>We comply with the <b>Protection of Personal Information Act 4 of 2013 (POPIA)</b>.</p>
          <ul>
            <li>We collect: name, email, phone, delivery address, order history</li>
            <li>Used only to fulfil orders, delivery, PayFast payment, and support</li>
            <li>We never sell your data. PayFast processes card payments securely - we don't store card numbers</li>
            <li>You may request access, correction or deletion of your data at any time</li>
            <li>Contact: gontsewamodise01@gmail.com</li>
          </ul>
        </>
      )}

      {termsTab==='Terms of service' && (
        <ul>
          <li>Prices in ZAR, VAT included. Prices may change without notice</li>
          <li>You must be 18+ or have guardian consent to order</li>
          <li>All orders subject to stock availability and PayFast payment confirmation</li>
          <li>We are not liable for courier delays, wrong address provided, or PayFast failures</li>
          <li>These terms are governed by South African law. Disputes: Lephalale Magistrate's Court</li>
        </ul>
      )}

      {termsTab==='Contact' && (
        <p><b>Urban Cart</b><br/>Lephalale, Limpopo, South Africa<br/>Email: gontsewamodise01@gmail.com<br/>Response within 2 business days</p>
      )}
      </div>

      <p style={{fontSize:11, opacity:.6, marginTop:14}}>Last updated November 2026 | Governed by South African law</p>
      <button className="btn-black full" style={{marginTop:12}} onClick={()=>closeTerms()}>I UNDERSTAND</button>
    </section>
  </div>
)}

  {adminOpen&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setAdminOpen(false)}}>
    <section className="modal wide-modal" style={{maxWidth:980, width:'96vw'}}>
      <div className="drawer-head"><h2>ADMIN — {adminTab.toUpperCase()}</h2><button onClick={()=>setAdminOpen(false)}><X size={16}/></button></div>
      <div className="auth-switch" style={{display:'flex', gap:6, flexWrap:'wrap', justifyContent:'center'}}>
        <button className={adminTab==='dashboard'?'on':''} onClick={()=>setAdminTab('dashboard')}><TrendingUp size={12} style={{display:'inline'}}/> DASHBOARD</button>
        <button className={adminTab==='orders'?'on':''} onClick={()=>setAdminTab('orders')}>ORDERS ({adminOrders.length})</button>
        <button className={adminTab==='products'?'on':''} onClick={()=>setAdminTab('products')}>PRODUCTS ({products.length})</button>
        <button className={adminTab==='customers'?'on':''} onClick={()=>setAdminTab('customers')}><Users size={12} style={{display:'inline'}}/> CUSTOMERS ({adminUsers.length})</button>
        <button className={adminTab==='staff'?'on':''} onClick={()=>setAdminTab('staff')}><Crown size={12} style={{display:'inline'}}/> STAFF</button>
      </div>

      {adminTab==='dashboard' && (
        <div>
          <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:10, marginBottom:16}}>
            <div style={{border:'2px solid #121212', padding:12, background:'#FFFCF8'}}><small style={{fontSize:9, fontWeight:700, letterSpacing:1}}>TODAY</small><div style={{fontFamily:'Anton', fontSize:22}}>{fmt(analytics.todayRev)}</div><small>revenue today</small></div>
            <div style={{border:'2px solid #121212', padding:12, background:'#C9A87A'}}><small style={{fontSize:9, fontWeight:700, letterSpacing:1}}>THIS MONTH</small><div style={{fontFamily:'Anton', fontSize:22}}>{fmt(analytics.monthRev)}</div><small>revenue month</small></div>
            <div style={{border:'2px solid #121212', padding:12, background:'#fff'}}><small style={{fontSize:9, fontWeight:700}}>TOTAL REVENUE</small><div style={{fontFamily:'Anton', fontSize:22}}>{fmt(analytics.totalRev)}</div><small>{analytics.totalOrders} orders</small></div>
            <div style={{border:'2px solid #121212', padding:12, background:'#fff'}}><small style={{fontSize:9, fontWeight:700}}>PENDING / FAILED</small><div style={{fontFamily:'Anton', fontSize:22}}>{analytics.pending} / {analytics.failed}</div><small>needs attention</small></div>
          </div>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
            <div style={{border:'2px solid #121212', padding:12}}>
              <h3 style={{fontFamily:'Anton', margin:'0 0 10px', fontSize:16}}><DollarSign size={14} style={{display:'inline'}}/> BEST SELLERS</h3>
              {!analytics.best.length && <p style={{fontSize:11, opacity:.6}}>No sales yet</p>}
              {analytics.best.map(b=><div key={b.id} style={{display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #eee', fontSize:11}}><b>{b.name}</b><span>{b.qty} sold • {fmt(b.total)}</span></div>)}
            </div>
            <div style={{border:'2px solid #121212', padding:12}}>
              <h3 style={{fontFamily:'Anton', margin:'0 0 10px', fontSize:16}}><Bell size={14} style={{display:'inline'}}/> NEW ORDERS (24h)</h3>
              {adminOrders.filter(o=> (Date.now()-new Date(o.created_at).getTime())<86400000).slice(0,5).map(o=><div key={o.id} style={{display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #eee', fontSize:11}}><span>#{o.id} {o.customer_name||o.full_name}</span><b>{fmt(o.total)} • {o.payment_status||o.status}</b></div>)}
            </div>
          </div>
        </div>
      )}

      {adminTab==='orders' && (
        <div>
          <div style={{display:'flex', gap:6, flexWrap:'wrap', marginBottom:12}}>
            {['all','new','paid','failed','processing','shipped','delivered','cancelled','refunded'].map(f=><button key={f} onClick={()=>setOrderFilter(f)} style={{height:32, padding:'0 12px', border:'2px solid #121212', background: orderFilter===f ? '#121212':'#fff', color: orderFilter===f ? '#fff':'#121212', fontSize:10, fontWeight:700}}>{f.toUpperCase()}</button>)}
          </div>
          <div style={{maxHeight:'65vh', overflow:'auto'}}>
            {filteredOrders.map(o=>(
              <div key={o.id} style={{border:'2px solid #121212', padding:12, marginBottom:10, background: o.status==='cancelled'?'#ffe0e0': o.status==='refunded'?'#e0e7ff' : o.payment_status==='failed' ? '#fef3c7' : '#FFFCF8'}}>
                <div style={{display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:6}}>
                  <b>#{o.id} {o.customer_name || o.full_name} - {o.email}</b>
                  <div style={{display:'flex', gap:6}}>
                    <span style={{fontSize:10, background:'#121212', color:'#fff', padding:'4px 8px'}}>{(o.payment_status||'paid').toUpperCase()}</span>
                    <span style={{fontSize:10, background: o.status==='cancelled'?'#ff3b30': o.status==='refunded'?'#6366f1':'#121212', color:'#fff', padding:'4px 8px'}}>{o.cancel_reason ? `CANCELLED` : (o.delivery_status || o.status).toUpperCase()}</span>
                  </div>
                </div>
                <p style={{fontSize:11, margin:'6px 0'}}>📍 {o.delivery_address || o.address}, {o.province}, {o.postal_code} | 📞 {o.phone}</p>
                <p style={{fontSize:11}}>Location: {o.current_location} | ETA: {o.eta} | Total: {fmt(o.total)}</p>
                {o.cancel_reason && <p style={{fontSize:11, background:'#fff', border:'1px dashed #ff3b30', padding:6}}>Reason: {o.cancel_reason}</p>}
                <div style={{display:'flex', gap:6, marginTop:8, flexWrap:'wrap'}}>
                  <button className="btn-ghost" style={{height:32, fontSize:10}} onClick={()=>{setEditingOrder(o); setEditData({delivery_status:o.delivery_status||o.status, current_location:o.current_location||'Warehouse - Lephalale', eta:o.eta||'2-3 days', tracking_note:''});}}>UPDATE TRACKING</button>
                  {/* FIX B: DB-safe lowercase values */}
                  <select value={toSafeStatus(o.status)} onChange={e=>updateStatus(o.id,e.target.value)} style={{border:'2px solid #121212', fontSize:10, fontWeight:700, height:32}}>
                    {['pending','paid','processing','shipped','delivered','cancelled','refunded'].map(s=><option key={s} value={s}>{s.toUpperCase()}</option>)}
                  </select>
                  <button className="btn-ghost" style={{height:32, fontSize:10, borderColor:'#6366f1', color:'#6366f1'}} onClick={()=>issueRefund(o.id)}>REFUND</button>
                  <button className="btn-ghost" style={{height:32, fontSize:10}} onClick={()=>printInvoice(o,'invoice')}><Printer size={12}/> INVOICE</button>
                  <button className="btn-ghost" style={{height:32, fontSize:10}} onClick={()=>printInvoice(o,'delivery')}><FileText size={12}/> DELIVERY</button>
                </div>
                <div style={{marginTop:6}}>{o.items?.map((it,idx)=><div key={idx} style={{fontSize:10}}>{it.name} x {it.quantity} - {fmt(it.price)}</div>)}</div>
              </div>
            ))}
          </div>
          {editingOrder && (<div className="overlay" style={{zIndex:10001}} onMouseDown={e=>{if(e.target===e.currentTarget)setEditingOrder(null)}}><section className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:500}}><div className="drawer-head"><h2>UPDATE ORDER #{editingOrder.id}</h2><button onClick={()=>setEditingOrder(null)}><X size={16}/></button></div><div style={{display:'flex', flexDirection:'column', gap:10, marginTop:12}}><label style={{fontSize:11, fontWeight:700}}>Delivery Status (human label)</label><select value={editData.delivery_status} onChange={e=>setEditData({...editData, delivery_status:e.target.value})} style={{height:42, border:'2px solid #121212'}}><option>Order Placed</option><option>Processing</option><option>Packed</option><option>Shipped</option><option>Out for Delivery</option><option>Delivered</option><option>Delayed</option></select><p style={{fontSize:10, background:'#fef3c7', padding:6, border:'1px solid #121212'}}>Will be mapped to: <b>{toSafeStatus(STATUS_MAP[editData.delivery_status]||editData.delivery_status)}</b> for DB</p><label style={{fontSize:11, fontWeight:700}}>Current Location</label><input value={editData.current_location} onChange={e=>setEditData({...editData, current_location:e.target.value})} style={{height:42, border:'2px solid #121212', padding:'0 12px'}}/><label style={{fontSize:11, fontWeight:700}}>ETA</label><input value={editData.eta} onChange={e=>setEditData({...editData, eta:e.target.value})} style={{height:42, border:'2px solid #121212', padding:'0 12px'}}/><label style={{fontSize:11, fontWeight:700}}>Note to Customer</label><textarea value={editData.tracking_note} onChange={e=>setEditData({...editData, tracking_note:e.target.value})} style={{height:80, border:'2px solid #121212', padding:12}}/><button className="btn-black full" onClick={saveTrackingUpdate} disabled={busy}>{busy?'SAVING...':'SAVE UPDATE'}</button><button className="btn-ghost full" onClick={()=>setEditingOrder(null)}>CANCEL</button></div></section></div>)}
          {cancelModal && (<div className="overlay" style={{zIndex:10002}} onMouseDown={e=>{if(e.target===e.currentTarget)setCancelModal(null)}}><section className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:500}}><div className="drawer-head"><h2><AlertTriangle size={16} style={{display:'inline'}}/> CANCEL ORDER #{cancelModal}</h2><button onClick={()=>setCancelModal(null)}><X size={16}/></button></div><select value={cancelReason} onChange={e=>setCancelReason(e.target.value)} style={{height:42, border:'2px solid #121212', padding:'0 12px', width:'100%'}}><option value="">-- Select reason --</option><option value="Out of stock">Out of stock</option><option value="Customer requested cancellation">Customer requested cancellation</option><option value="Wrong address / unable to deliver">Wrong address / unable to deliver</option><option value="Suspicious / fraud payment">Suspicious / fraud payment</option><option value="Courier cannot reach area">Courier cannot reach area</option><option value="Damaged in warehouse">Damaged in warehouse</option></select><textarea value={cancelReason} onChange={e=>setCancelReason(e.target.value)} placeholder="Detailed reason..." style={{height:100, border:'2px solid #121212', padding:12, width:'100%', marginTop:10}}/><button className="btn-black full" style={{background:'#ff3b30', marginTop:10}} onClick={confirmCancel} disabled={busy}>CONFIRM CANCEL</button><button className="btn-ghost full" style={{marginTop:8}} onClick={()=>{setCancelModal(null); setCancelReason('');}}>KEEP ORDER</button></section></div>)}
        </div>
      )}

      {adminTab==='customers' && (
        <div>
          <input value={userSearch} onChange={e=>setUserSearch(e.target.value)} placeholder="Search customers by name/email/phone" style={{width:'100%', height:44, border:'2px solid #121212', padding:'0 12px', marginBottom:12}}/>
          <div style={{maxHeight:'60vh', overflow:'auto'}}>
            {filteredUsers.map(u=>(
              <div key={u.id} style={{border:'2px solid #121212', padding:12, marginBottom:8, background: u.is_blocked ? '#ffe0e0' : '#FFFCF8', opacity: u.is_blocked ? 0.7 : 1}}>
                <div style={{display:'flex', justifyContent:'space-between', gap:10, flexWrap:'wrap'}}>
                  <div><b>{u.name} {u.role==='admin'&&<span style={{background:'#121212', color:'#C9A87A', padding:'2px 6px', fontSize:8}}>ADMIN</span>} {u.is_blocked&&<span style={{background:'#ff3b30', color:'#fff', padding:'2px 6px', fontSize:8}}>BLOCKED</span>}</b><br/><small>{u.email} • {u.phone||'no phone'}</small></div>
                  <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
                    <button className="btn-ghost" style={{height:32, fontSize:10}} onClick={()=>messageUser(u)}><MessageCircle size={12}/> MESSAGE</button>
                    <button className="btn-ghost" style={{height:32, fontSize:10, borderColor: u.is_blocked ? '#121212' : '#ff3b30', color: u.is_blocked ? '#121212' : '#ff3b30'}} onClick={()=>blockUser(u)}><Ban size={12}/> {u.is_blocked?'UNBLOCK':'BLOCK'}</button>
                    <button className="btn-ghost" style={{height:32, fontSize:10}} onClick={()=>makeAdmin(u)}><Crown size={12}/> {u.role==='admin'?'REMOVE ADMIN':'MAKE ADMIN'}</button>
                  </div>
                </div>
              </div>
            ))}
            {!filteredUsers.length && <div className="empty">No customers yet - users will appear after they sign up. Endpoint: GET /admin/users</div>}
          </div>
        </div>
      )}

      {adminTab==='staff' && (
        <div>
          <div style={{background:'#fff3cd', border:'2px solid #121212', padding:10, marginBottom:12, fontSize:11}}><b>Staff management:</b> Make trusted users admin. Admins can see this panel. Be careful.</div>
          {adminUsers.filter(u=>u.role==='admin').map(u=><div key={u.id} style={{border:'2px solid #121212', padding:12, marginBottom:8, background:'#FFFCF8', display:'flex', justifyContent:'space-between', alignItems:'center'}}><div><b>{u.name}</b> — {u.email} <span style={{background:'#121212', color:'#C9A87A', padding:'2px 6px', fontSize:9}}>ADMIN</span></div><button className="btn-ghost" style={{height:32, fontSize:10}} onClick={()=>makeAdmin(u)}>REMOVE</button></div>)}
          {!adminUsers.filter(u=>u.role==='admin').length && <div className="empty">No admins besides you</div>}
          <h3 style={{fontFamily:'Anton', marginTop:16}}>ALL USERS — PROMOTE TO STAFF</h3>
          {filteredUsers.filter(u=>u.role!=='admin').slice(0,20).map(u=><div key={u.id} style={{display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #ddd', fontSize:11}}><span>{u.name} • {u.email}</span><button className="btn-black" style={{height:28, fontSize:10}} onClick={()=>makeAdmin(u)}>MAKE ADMIN</button></div>)}
        </div>
      )}

      {adminTab==='products' && (
        <div>
          <form onSubmit={editingId? saveEdit : createProduct} className="auth-form" style={{padding:16, border:'2px solid var(--ink)', background:'#fff'}}>
            <h3 style={{fontFamily:'Anton', margin:'0 0 8px'}}>{editingId? `EDIT #${editingId}` : 'CREATE NEW PRODUCT'}</h3>
            <input required placeholder="Name" value={prodForm.name} onChange={e=>setProdForm(f=>({...f,name:e.target.value}))}/>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8}}>
              <select value={prodForm.category} onChange={e=>setProdForm(f=>({...f,category:e.target.value}))}>{['Tech','Home','Lifestyle','Accessories'].map(c=><option key={c}>{c}</option>)}</select>
              <input required type="number" step="0.01" placeholder="Price ZAR" value={prodForm.price} onChange={e=>setProdForm(f=>({...f,price:e.target.value}))}/>
              <input required type="number" placeholder="Stock" value={prodForm.stock} onChange={e=>setProdForm(f=>({...f,stock:e.target.value}))}/>
            </div>

            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
              <label>MEASURED IN
                <select value={form.unit || 'none'} onChange={e=>setForm({...form, unit:e.target.value})} style={{width:'100%', padding:10, border:'2px solid #121212'}}>
                  <option value="none">No measurement</option>
                  <option value="kg">Kilograms (kg)</option>
                  <option value="g">Grams (g)</option>
                  <option value="L">Litres (L)</option>
                  <option value="ml">Millilitres (ml)</option>
                  <option value="pcs">Pieces (pcs)</option>
                  <option value="pack">Pack</option>
                  <option value="pair">Pair</option>
                  <option value="size">Size (S,M,L...)</option>
                </select>
              </label>
              {form.unit !== 'none' && (
                <label>{form.unit === 'size' ? 'SIZES - comma separated' : 'VALUE - e.g. 500'} 
                  <input 
                    value={form.unit_value || ''} 
                    onChange={e=>setForm({...form, unit_value:e.target.value})} 
                    placeholder={form.unit === 'size' ? 'S,M,L,XL' : '500'} 
                    style={{width:'100%', padding:10, border:'2px solid #121212'}} 
                  />
                </label>
              )}
            </div>

            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
              <div style={{display:'flex', gap:8, alignItems:'center', border:'2px solid #121212', padding:'0 10px', height:44}}><input type="checkbox" checked={prodForm.on_sale} onChange={e=>setProdForm(f=>({...f,on_sale:e.target.checked}))}/><label style={{fontSize:11, fontWeight:700}}><Tag size={12} style={{display:'inline'}}/> ON SALE</label></div>
              <input type="number" step="0.01" placeholder="Sale price (if on sale)" value={prodForm.sale_price} onChange={e=>setProdForm(f=>({...f,sale_price:e.target.value}))} style={{height:44, border:'2px solid #121212', padding:'0 12px'}} disabled={!prodForm.on_sale}/>
            </div>
            <div style={{display:'flex', gap:8, alignItems:'center', border:'2px solid #121212', padding:'0 10px', height:44}}><input type="checkbox" checked={prodForm.is_active} onChange={e=>setProdForm(f=>({...f,is_active:e.target.checked}))}/><label style={{fontSize:11, fontWeight:700}}>{prodForm.is_active ? 'ACTIVE (in stock)' : 'HIDDEN / OUT OF STOCK'}</label></div>
            <input required placeholder="Image URL https://..." value={prodForm.image_url} onChange={e=>setProdForm(f=>({...f,image_url:e.target.value}))}/>
            <label style={{fontSize:11, fontWeight:700, marginTop:4}}>EXTRA IMAGES (up to 4 more - total 5)</label>
              {[0,1,2,3].map(i=>(
                <input key={i} placeholder={`Extra image ${i+1} URL https://...`} value={prodForm.images?.[i]||''} onChange={e=>{
                  const imgs=[...(prodForm.images||['','','',''])]; imgs[i]=e.target.value; setProdForm(f=>({...f,images:imgs}));
                }} />
              ))}
            <textarea placeholder="Description" value={prodForm.description} onChange={e=>setProdForm(f=>({...f,description:e.target.value}))} style={{minHeight:80, border:'2px solid var(--ink)', padding:12, fontFamily:'Syne'}}/>
              <button type="button" onClick={() => {
                setEditingId(null);
                setProdForm({name:'',category:'Tech',price:'',sale_price:'',on_sale:false,stock:'',description:'',image_url:'',images:['','','',''],is_active:true,unit:'none',unit_value:''});
              }} style={{height:44, border:'2px solid #121212', background:'#fff', fontWeight:800, cursor:'pointer'}}>CANCEL</button>
              <button type="submit" className="btn-black full">{editingId ? 'SAVE CHANGES' : 'CREATE PRODUCT'}
              </button>
          </form>
          <div style={{display:'flex', flexDirection:'column', gap:8, maxHeight:'35vh', overflow:'auto', marginTop:12}}>
            {products.map(p=><div key={p.id} className="admin-row" style={{opacity: isOutOfStock(p)?0.6:1}}>
              <div style={{display:'flex', gap:10, alignItems:'center'}}>
                <img src={p.image_url} style={{width:48, height:48, objectFit:'cover', border:'1px solid var(--ink)'}}/>
                <div><b>{p.name} {p.on_sale&&<span style={{background:'#F59E0B', color:'#fff', padding:'1px 5px', fontSize:8}}>SALE</span>} {isOutOfStock(p)&&<span style={{background:'#ff3b30', color:'#fff', padding:'1px 5px', fontSize:8}}>OUT</span>}</b><small>{p.category} • {p.on_sale?`${fmt(p.sale_price)} (was ${fmt(p.price)})`:fmt(p.price)} • Stock {p.stock} • {p.is_active?'Active':'Hidden'}</small></div>
              </div>
              <div style={{display:'flex', gap:6}}>
                <button className="btn-ghost" style={{height:32, fontSize:10}} onClick={()=>quickSaleToggle(p)}><Tag size={12}/> {p.on_sale?'REMOVE SALE':'SALE'}</button>
                <button className="btn-ghost" style={{height:32, fontSize:10}} onClick={()=>toggleStock(p)}><Archive size={12}/> {isOutOfStock(p)?'RESTOCK':'OUT'}</button>
                <button className="btn-ghost" style={{height:32}} onClick={()=>startEdit(p)}>EDIT</button>
                <button className="btn-black" style={{height:32, background:'#ff3b30'}} onClick={()=>deleteProduct(p.id)}>DEL</button>
              </div>
            </div>)}
          </div>
        </div>
      )}
    </section>
  </div>}
  {/* COOKIE BANNER */}
    {!cookieConsent && (
      <div style={{
        position:'fixed', bottom:0, left:0, right:0, zIndex:9999,
        background:'#121212', color:'#FFFCF8',
        display:'flex', alignItems:'center', gap:12, flexWrap:'wrap',
        padding:'12px 16px', borderTop:'2px solid #C9A87A',
        fontSize:12, lineHeight:1.5
      }}>
        <span style={{flex:1, minWidth:220}}>
          We use cookies to keep your bag saved and make checkout work. By continuing, you agree to our <span onClick={()=>{ setShowTerms(true); setTermsTab('privacy'); }} style={{textDecoration:'underline', cursor:'pointer', color:'#E9D9BF'}}>Privacy Policy</span>.
        </span>
        <button onClick={()=>{ localStorage.setItem('uc_cookie_consent','yes'); setCookieConsent(true); }} style={{
          background:'#E9D9BF', color:'#121212', border:'none',
          padding:'8px 16px', fontWeight:800, fontSize:11, letterSpacing:1, cursor:'pointer', flexShrink:0
        }}>
          GOT IT
        </button>
      </div>
    )}
</div>
}
createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
