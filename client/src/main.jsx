import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Search, ShoppingBag, ArrowUpRight, Plus, Minus, X, Menu, Check, ShieldCheck, Truck, RotateCcw, PackageCheck, UserRound, MapPin, Clock, FileText, AlertTriangle, Bell, Tag, Ban, MessageCircle, Printer, TrendingUp, DollarSign, Users, Crown, Eye, Archive } from 'lucide-react';
import './styles.css';

const RAW = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '');
const API = RAW.includes('/api') ? RAW : RAW + '/api';

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

const fmt = n => new Intl.NumberFormat('en-ZA',{style:'currency',currency:'ZAR',maximumFractionDigits:2}).format(Number(n||0));
const PROVINCES = ['LIMPOPO','GAUTENG','WESTERN CAPE','EASTERN CAPE','KWAZULU-NATAL','FREE STATE','MPUMALANGA','NORTH WEST','NORTHERN CAPE'];

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
 const [editData,setEditData]=useState({delivery_status:'Order Placed', current_location:'Warehouse - Johannesburg', eta:'2-3 business days', tracking_note:''});
 const [form,setForm]=useState({full_name:'',email:'',phone:'',address_search:'',delivery_address:'',province:'LIMPOPO',postal_code:''});
 const [authForm,setAuthForm]=useState({name:'',email:'',password:'', acceptTerms:false});
 const [authError,setAuthError]=useState('');
 const [showTerms,setShowTerms]=useState(false);
 const [adminTab,setAdminTab]=useState('dashboard');
 const [prodForm,setProdForm]=useState({name:'',category:'Tech',price:'',sale_price:'',on_sale:false,stock:'',description:'',image_url:'',is_active:true});
 const [editingId,setEditingId]=useState(null);
 const [orderFilter,setOrderFilter]=useState('all');
 const [userSearch,setUserSearch]=useState('');
 const categories=['All','Tech','Home','Lifestyle','Accessories'];

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
      setCart([]);
      setNotice(`Payment successful! Order #${params.get('order')} received. Receipt sent to your email.`); 
      window.history.replaceState({}, '', window.location.pathname);
      setActiveTab('track');
      loadTracking();
    }
    if(params.get('payment')==='cancel'){ 
      setNotice('Payment cancelled - your cart is saved.'); 
      window.history.replaceState({}, '', window.location.pathname);
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

 async function loadTracking(){
   try{
     const data = await api('/orders/my-orders');
     setTrackingOrders(data);
     setOrders(data);
   }catch(e){ setNotice(e.message); }
 }

 const visible=useMemo(()=>products.filter(p=>(category==='All'|| (p.category||'').toLowerCase()===category.toLowerCase())&& `${p.name} ${p.description} ${p.category}`.toLowerCase().includes(search.toLowerCase())),[products,category,search]);
 const visibleAll=useMemo(()=>products.filter(p=> `${p.name} ${p.description} ${p.category}`.toLowerCase().includes(search.toLowerCase())),[products,search]);
 const count = cart.reduce((s,p)=>s+p.quantity,0), total=cart.reduce((s,p)=>s+effectivePrice(p)*p.quantity,0);    
 const setField=(k,v)=>setForm(f=>({...f,[k]:v}));
 const hasOrders = trackingOrders.length > 0 || orders.length > 0;

 // --- analytics computed ---
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
 function openProduct(p){ setSelectedProduct(p); setShowAll(false); setActiveTab('shop'); window.scrollTo({top:0, behavior:'smooth'}); }
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
    setNotice(`Welcome${data.user.name?`, ${data.user.name.split(' ')[0]}`:''}!`); 
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
      full_name: form.full_name, customer_name: form.full_name, email: form.email, phone: form.phone,
      address_search: form.address_search, delivery_address: form.delivery_address, address: form.delivery_address,
      province: form.province, postal_code: form.postal_code, city: form.delivery_address, customer_id: user?.id,
      items: cart.map(p => ({ id: p.id, product_id: p.id, quantity: p.quantity, price: effectivePrice(p) }))
    })});
    const pay = await api('/payfast/checkout',{method:'POST',body:JSON.stringify({ orderId: order.orderId })});
    if (!pay.action || !pay.fields) throw new Error('PayFast is not configured yet on server');
    localStorage.setItem('lastOrderId', order.orderId);
    const formEl = document.createElement('form'); formEl.method='POST'; formEl.action=pay.action; formEl.style.display='none';
    Object.entries(pay.fields).forEach(([name, value]) => { const input=document.createElement('input'); input.type='hidden'; input.name=name; input.value=String(value ?? ''); formEl.appendChild(input); });
    document.body.appendChild(formEl); setCheckoutOpen(false); formEl.submit();
  } catch (err) { setCheckoutError(err.message || 'Could not start PayFast checkout.'); } finally { setBusy(false); }
 }

 // ---- admin products ----
 async function createProduct(e){
    e.preventDefault();
    try{
      const payload={...prodForm, price:Number(prodForm.price), sale_price: prodForm.sale_price?Number(prodForm.sale_price):null, stock:Number(prodForm.stock), on_sale: Boolean(prodForm.on_sale), is_active: Boolean(prodForm.is_active)};
      const p = await api('/admin/products',{method:'POST', body:JSON.stringify(payload)});
      setProducts(old=>[p,...old]); setNotice('Product created'); 
      setProdForm({name:'',category:'Tech',price:'',sale_price:'',on_sale:false,stock:'',description:'',image_url:'',is_active:true});
    }catch(err){setNotice(err.message)}
  }
  async function saveEdit(e){
    e.preventDefault();
    try{
      const payload={...prodForm, price:Number(prodForm.price), sale_price: prodForm.sale_price?Number(prodForm.sale_price):null, stock:Number(prodForm.stock), on_sale: Boolean(prodForm.on_sale), is_active: Boolean(prodForm.is_active)};
      const p = await api(`/admin/products/${editingId}`,{method:'PUT', body:JSON.stringify(payload)});
      setProducts(old=>old.map(x=>x.id===editingId? p : x));
      setEditingId(null); setProdForm({name:'',category:'Tech',price:'',sale_price:'',on_sale:false,stock:'',description:'',image_url:'',is_active:true}); setNotice('Product updated');
    }catch(err){setNotice(err.message)}
  }
  function startEdit(p){
    setEditingId(p.id);
    setProdForm({name:p.name, category:p.category||'Tech', price:String(p.price), sale_price: p.sale_price?String(p.sale_price):'', on_sale: !!p.on_sale, stock:String(p.stock), description:p.description, image_url:p.image_url, is_active: p.is_active ?? true});
    setAdminTab('products');
  }
  async function deleteProduct(id){
    if(!confirm('Delete this product?')) return;
    try{ await api(`/admin/products/${id}`,{method:'DELETE'}); setProducts(old=>old.filter(x=>x.id!==id)); setNotice('Product deleted'); }catch(err){setNotice(err.message)}
  }
  async function toggleStock(p){
    const newActive = !p.is_active || Number(p.stock)>0 ? false : true; // simple toggle logic
    // If out of stock -> make active with stock 10, else make inactive
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

 // ---- admin orders/users ----
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
 async function updateStatus(id,status){
   if(status==='cancelled'){ setCancelModal(id); return; }
   try{await api(`/admin/orders/${id}/status`,{method:'PATCH',body:JSON.stringify({status})});setAdminOrders(old=>old.map(o=>o.id===id?{...o,status, delivery_status:status}:o));}catch(e){setNotice(e.message);}
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
     // fallback if endpoint not exist
     try{
       await api(`/admin/orders/${id}/status`,{method:'PATCH',body:JSON.stringify({status:'refunded'})});
       setAdminOrders(old=>old.map(o=>o.id===id?{...o,status:'refunded', payment_status:'refunded'}:o));
       setNotice(`Order #${id} marked as refunded (manual refund in PayFast)`);
     }catch(err){ setNotice(err.message); }
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
 async function saveTrackingUpdate(){
   if(!editingOrder) return;
   setBusy(true);
   try{
     await api(`/admin/orders/${editingOrder.id}`,{method:'PUT', body:JSON.stringify(editData)});
     setNotice(`Tracking updated for Order #${editingOrder.id}`);
     setEditingOrder(null);
     showAdmin();
   }catch(e){ setNotice(e.message); }
   finally{ setBusy(false); }
 }
 function printInvoice(o, type='invoice'){
   const itemsHtml = (o.items||[]).map(it=>`<tr><td>${it.name}</td><td style="text-align:center">${it.quantity}</td><td style="text-align:right">${fmt(it.price)}</td><td style="text-align:right">${fmt(Number(it.price)*Number(it.quantity))}</td></tr>`).join('');
   const html = `
   <html><head><title>${type.toUpperCase()} #${o.id}</title>
   <style>body{font-family:monospace;padding:32px;color:#121212}h1{font-family:Anton,sans-serif;font-size:32px;margin:0} table{width:100%;border-collapse:collapse;margin-top:16px} td,th{border:1px solid #121212;padding:8px;font-size:12px} .head{display:flex;justify-content:space-between;border-bottom:3px solid #121212;padding-bottom:12px}</style>
   </head><body>
   <div class="head"><div><h1>URBAN CART</h1><small>SOWETO — JHB — SA<br/>PayFast Secure</small></div><div style="text-align:right"><b>${type.toUpperCase()}</b><br/>#${o.id}<br/>${new Date(o.created_at).toLocaleDateString()}<br/>${o.status.toUpperCase()} / ${(o.payment_status||'paid').toUpperCase()}</div></div>
   <div style="display:flex;gap:40px;margin-top:20px"><div><b>BILL TO:</b><br/>${o.customer_name||o.full_name}<br/>${o.email}<br/>${o.phone}<br/>${o.delivery_address||o.address}<br/>${o.province}, ${o.postal_code}</div><div><b>${type==='invoice'?'SHIP TO:':'DELIVERY:'}</b><br/>${o.delivery_address||o.address}<br/>${o.province}<br/>Courier: ${o.current_location||'Warehouse JHB'}<br/>ETA: ${o.eta||'2-3 days'}</div></div>
   <table><thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead><tbody>${itemsHtml}</tbody><tfoot><tr><td colspan="3" style="text-align:right"><b>TOTAL</b></td><td style="text-align:right"><b>${fmt(o.total)}</b></td></tr></tfoot></table>
   ${type==='delivery' ? `<div style="margin-top:40px;border:2px dashed #121212;padding:16px"><b>DELIVERY NOTE:</b><br/>Order #${o.id} — Handle with care. Customer phone: ${o.phone}. Signature required. ${o.cancel_reason?`<br/>NOTE: ${o.cancel_reason}`:''}</div>` : ''}
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

 return <div className="app">
  <div className="ticker"><div className="ticker-track"><span>● FREE DELIVERY OVER R1,000 ● SECURE PAYFAST ● CURATED IN SA ● EVERYDAY ELEVATED ●</span><span>● FREE DELIVERY OVER R1,000 ● SECURE PAYFAST ● CURATED IN SA ● EVERYDAY ELEVATED ●</span></div></div>
  <header className="header">
    <div className="header-left">
      <button className="icon-btn mobile-only" onClick={()=>setMenuOpen(!menuOpen)}><Menu size={20}/></button>
      <a className="brand" href="#" onClick={()=>{setCategory('All');setSearch('');closeProduct();setShowAll(false); setActiveTab('shop');}}>
        <span className="brand-mark">U</span> URBAN CART <i>®</i>
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
  {searchOpen && <div className="mobile-search-overlay show"><input autoFocus value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search products..."/><button onClick={()=>setSearchOpen(false)}><X size={16}/></button></div>}
  <main>
    {activeTab==='track' ? (
      <section className="shop">
        <div className="shop-head"><h2>MY ORDERS & TRACKING</h2><button className="btn-ghost" onClick={()=>setActiveTab('shop')}>BACK TO SHOP</button></div>
        {!trackingOrders.length && <div className="empty">No orders yet - <button onClick={()=>setActiveTab('shop')}>Start shopping</button></div>}
        {trackingOrders.map(o=>(
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
      <div className="product-view">
        <div className="product-view-left">
          <img src={selectedProduct.image_url} alt={selectedProduct.name}/>
          <div className="img-meta"><span>{selectedProduct.category} {selectedProduct.on_sale && <b style={{background:'#F59E0B', color:'#000', padding:'2px 6px', marginLeft:8}}>SALE</b>}</span><span>{isOutOfStock(selectedProduct) ? 'OUT OF STOCK' : `${selectedProduct.stock} IN STOCK`}</span></div>
        </div>
        <div className="product-view-right">
          <button className="close-view" onClick={closeProduct}><X size={14}/> CLOSE</button>
          <h1>{selectedProduct.name}</h1>
          <p className="desc">{selectedProduct.description}</p>
          <div className="price-row">
            {selectedProduct.on_sale ? <><strong style={{color:'#92400E'}}>{fmt(effectivePrice(selectedProduct))}</strong><span style={{textDecoration:'line-through', fontSize:14}}>{fmt(selectedProduct.price)}</span></> : <strong>{fmt(effectivePrice(selectedProduct))}</strong>}
            <span>ZAR • VAT INCL.</span>
          </div>
          <div className="buy-row">
            <button className="btn-black" disabled={isOutOfStock(selectedProduct)} onClick={()=>{add(selectedProduct);}} style={{opacity: isOutOfStock(selectedProduct)?0.4:1}}>
              {isOutOfStock(selectedProduct) ? 'OUT OF STOCK' : `ADD TO BAG — ${fmt(effectivePrice(selectedProduct))}`} <ArrowUpRight size={16}/>
            </button>
            <button className="btn-ghost" onClick={()=>setCartOpen(true)}>View bag ({count})</button>
          </div>
          <div className="micro-badges">
            <span><Truck size={14}/> 2-4 DAY DELIVERY</span>
            <span><ShieldCheck size={14}/> PAYFAST SECURE</span>
            <span><RotateCcw size={14}/> 14-DAY RETURNS</span>
          </div>
        </div>
      </div>
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
              <div className="card-info"><div><h3>{p.name}</h3><small>{p.category}</small></div><div style={{textAlign:'right'}}>{p.on_sale?<><b style={{color:'#92400E'}}>{fmt(effectivePrice(p))}</b><br/><small style={{textDecoration:'line-through'}}>{fmt(p.price)}</small></>:<b>{fmt(p.price)}</b>}</div></div>
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
                <div className="card-info"><div><h3>{p.name}</h3><small>{p.category}</small></div><div style={{textAlign:'right'}}>{p.on_sale?<><b style={{color:'#92400E'}}>{fmt(effectivePrice(p))}</b><br/><small style={{textDecoration:'line-through', opacity:.6}}>{fmt(p.price)}</small></>:<b>{fmt(p.price)}</b>}</div></div>
              </article>
            )}
          </div>
        </section>
        <section id="story" className="manifesto">
          <div><h2>LESS NOISE.<br/>MORE<br/><em>MEANING.</em></h2></div>
          <div><p>Urban Cart started with one question: what if we only sold things we'd keep?</p><p>We don't do 10,000 products. We do 30 that matter. Tech that doesn't shout. Homeware that lasts. Everyday stuff that makes the day feel a little more considered.</p><p>Proudly built in Soweto. Shipping everywhere in South Africa.</p><a href="#shop" className="btn-outline">READ OUR RULES <ArrowUpRight size={14}/></a></div>
        </section>
      </>
    )}
  </main>
  <footer className="footer">
    <div className="foot-top"><span>© {new Date().getFullYear()} URBAN CART</span><span>SOWETO — JHB — SA</span><span>MADE FOR THE EVERYDAY ●</span></div>
    <div className="foot-big">URBAN CART</div>
  </footer>
  {notice&&<div className="toast"><Check size={14}/>{notice}<button onClick={()=>setNotice('')}><X size={12}/></button></div>}

  {cartOpen&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setCartOpen(false)}}>
    <aside className="drawer">
      <div className="drawer-head"><h2>BAG ({count})</h2><button onClick={()=>setCartOpen(false)}><X size={16}/></button></div>
      {!cart.length?<div className="empty-bag"><ShoppingBag size={28}/><h3>Bag is empty.</h3><p>Go add some good stuff.</p><button className="btn-black" onClick={()=>setCartOpen(false)}>SHOP NOW</button></div>:
      <>
        <div className="cart-list">{cart.map(p=><div key={p.id} className="cart-item"><img src={p.image_url}/><div><h4>{p.name} {p.on_sale&&<span style={{background:'#F59E0B',fontSize:8,padding:'2px 4px'}}>SALE</span>}</h4><b>{fmt(effectivePrice(p))} {p.on_sale&&<small style={{textDecoration:'line-through',fontWeight:400}}>{fmt(p.original_price||p.price)}</small>}</b><div className="qty"><button onClick={()=>changeQty(p.id,-1)}><Minus size={10}/></button><span>{p.quantity}</span><button onClick={()=>changeQty(p.id,1)}><Plus size={10}/></button></div></div><button className="remove" onClick={()=>removeItem(p.id)}>REMOVE</button></div>)}</div>
        <div className="cart-foot">
          <div className="sum"><span>SUBTOTAL ({count} items)</span><b>{fmt(total)}</b></div>
          <button className="btn-black full" onClick={handleCheckoutClick}>CHECKOUT — {fmt(total)} <ArrowUpRight size={14}/></button>
          {!user && <p style={{fontSize:11, color:'#ff3b30', textAlign:'center', marginTop:8}}>⚠ You must sign in to checkout</p>}
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
        <div><label style={{fontSize:11, fontWeight:700, display:'flex', justifyContent:'space-between'}}><span>Phone number *</span><span style={{fontWeight:400, opacity:.6}}>SA only</span></label><div style={{display:'flex', border:'2px solid #121212', height:44, marginTop:4}}><span style={{background:'#eee', padding:'0 10px', display:'grid', placeItems:'center', fontSize:12, fontWeight:700, borderRight:'2px solid #121212'}}>ZA +27</span><input required value={form.phone} onChange={e=>setField('phone',e.target.value)} placeholder="082 000 0000" style={{flex:1, border:0, padding:'0 12px'}}/></div></div>
        <div><label style={{fontSize:11, fontWeight:700}}>Delivery address *</label><input value={form.delivery_address} onChange={e=>setField('delivery_address',e.target.value)} placeholder="e.g. 24 Oak Avenue, Sandton" style={{width:'100%', height:44, border:'2px solid #121212', padding:'0 12px', marginTop:4}}/></div>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
          <div><label style={{fontSize:11, fontWeight:700}}>Province *</label><select required value={form.province} onChange={e=>setField('province',e.target.value)} style={{width:'100%', height:44, border:'2px solid #121212', padding:'0 12px', marginTop:4}}>{PROVINCES.map(p=><option key={p} value={p}>{p}</option>)}</select></div>
          <div><label style={{fontSize:11, fontWeight:700}}>Postal code *</label><input required value={form.postal_code} onChange={e=>setField('postal_code',e.target.value)} placeholder="2196" style={{width:'100%', height:44, border:'2px solid #121212', padding:'0 12px', marginTop:4}}/></div>
        </div>
        <div style={{border:'2px solid #121212', padding:12, background:'#FFFCF8'}}>
          <h4 style={{margin:'0 0 8px', fontFamily:'Anton', fontSize:13}}>PAYFAST SECURE</h4>
          <div style={{display:'flex', flexWrap:'wrap', gap:6, marginBottom:8}}>
            {['【entity-VISA¦canonical_name=VISA】','【entity-MasterCard¦canonical_name=MasterCard】','Capitec Pay','EFT Secure','Mobicred','SCode','Zapper'].map(m=><span key={m} style={{border:'1px solid #121212', padding:'4px 8px', fontSize:10, fontWeight:700, background:'#fff'}}>{m}</span>)}
          </div>
        </div>
        <div style={{display:'flex', justifyContent:'space-between', fontWeight:700, borderTop:'2px solid #121212', paddingTop:10, fontSize:13}}><span>SUBTOTAL ({count} items)</span><span>{fmt(total)}</span></div>
        <button className="btn-black full" disabled={busy || !user} type="submit" style={{height:48}}>{busy?'PREPARING...':`PAY ${fmt(total)} WITH PAYFAST`} <ShieldCheck size={14}/></button>
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
          {authMode==='register' && (<div className="terms-box"><label className="terms-check"><input type="checkbox" checked={authForm.acceptTerms} onChange={e=>setAuthForm(f=>({...f, acceptTerms:e.target.checked}))}/><span>I agree to the <button type="button" onClick={()=>setShowTerms(true)} style={{textDecoration:'underline', background:'none', border:'none', fontWeight:700, cursor:'pointer'}}>Terms & Conditions</button></span></label></div>)}
          <button className="btn-black full" disabled={busy}>{busy?'WAIT...':authMode==='login'?'SIGN IN':'CREATE ACCOUNT'}</button>
        </form>
      </>}
    </section>
  </div>}

  {showTerms && (
    <div className="overlay" style={{zIndex:10003}} onMouseDown={e=>{if(e.target===e.currentTarget)setShowTerms(false)}}>
      <section className="modal" style={{maxWidth:600}}>
        <div className="drawer-head"><h2>TERMS & CONDITIONS</h2><button onClick={()=>setShowTerms(false)}><X size={16}/></button></div>
        <div style={{maxHeight:'70vh', overflow:'auto', fontSize:12, lineHeight:1.6}}><h3>2. WHAT URBAN CART IS NOT RESPONSIBLE FOR</h3><ul><li>Wrong address, courier delays, PayFast failures</li></ul></div>
        <button className="btn-black full" style={{marginTop:12}} onClick={()=>setShowTerms(false)}>I UNDERSTAND</button>
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
            {['all','new','paid','failed','processing','shipped','cancelled','refunded'].map(f=><button key={f} onClick={()=>setOrderFilter(f)} style={{height:32, padding:'0 12px', border:'2px solid #121212', background: orderFilter===f ? '#121212':'#fff', color: orderFilter===f ? '#fff':'#121212', fontSize:10, fontWeight:700}}>{f.toUpperCase()}</button>)}
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
                  <button className="btn-ghost" style={{height:32, fontSize:10}} onClick={()=>{setEditingOrder(o); setEditData({delivery_status:o.delivery_status||o.status, current_location:o.current_location||'Warehouse - JHB', eta:o.eta||'2-3 days', tracking_note:''});}}>UPDATE TRACKING</button>
                  <select value={o.status} onChange={e=>updateStatus(o.id,e.target.value)} style={{border:'2px solid #121212', fontSize:10, fontWeight:700, height:32}}>
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
          {editingOrder && (<div className="overlay" style={{zIndex:10001}} onMouseDown={e=>{if(e.target===e.currentTarget)setEditingOrder(null)}}><section className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:500}}><div className="drawer-head"><h2>UPDATE ORDER #{editingOrder.id}</h2><button onClick={()=>setEditingOrder(null)}><X size={16}/></button></div><div style={{display:'flex', flexDirection:'column', gap:10, marginTop:12}}><label style={{fontSize:11, fontWeight:700}}>Delivery Status</label><select value={editData.delivery_status} onChange={e=>setEditData({...editData, delivery_status:e.target.value})} style={{height:42, border:'2px solid #121212'}}><option>Order Placed</option><option>Processing</option><option>Packed</option><option>Shipped</option><option>Out for Delivery</option><option>Delivered</option><option>Delayed</option></select><label style={{fontSize:11, fontWeight:700}}>Current Location</label><input value={editData.current_location} onChange={e=>setEditData({...editData, current_location:e.target.value})} style={{height:42, border:'2px solid #121212', padding:'0 12px'}}/><label style={{fontSize:11, fontWeight:700}}>ETA</label><input value={editData.eta} onChange={e=>setEditData({...editData, eta:e.target.value})} style={{height:42, border:'2px solid #121212', padding:'0 12px'}}/><label style={{fontSize:11, fontWeight:700}}>Note to Customer</label><textarea value={editData.tracking_note} onChange={e=>setEditData({...editData, tracking_note:e.target.value})} style={{height:80, border:'2px solid #121212', padding:12}}/><button className="btn-black full" onClick={saveTrackingUpdate} disabled={busy}>{busy?'SAVING...':'SAVE UPDATE'}</button><button className="btn-ghost full" onClick={()=>setEditingOrder(null)}>CANCEL</button></div></section></div>)}
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
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
              <div style={{display:'flex', gap:8, alignItems:'center', border:'2px solid #121212', padding:'0 10px', height:44}}><input type="checkbox" checked={prodForm.on_sale} onChange={e=>setProdForm(f=>({...f,on_sale:e.target.checked}))}/><label style={{fontSize:11, fontWeight:700}}><Tag size={12} style={{display:'inline'}}/> ON SALE</label></div>
              <input type="number" step="0.01" placeholder="Sale price (if on sale)" value={prodForm.sale_price} onChange={e=>setProdForm(f=>({...f,sale_price:e.target.value}))} style={{height:44, border:'2px solid #121212', padding:'0 12px'}} disabled={!prodForm.on_sale}/>
            </div>
            <div style={{display:'flex', gap:8, alignItems:'center', border:'2px solid #121212', padding:'0 10px', height:44}}><input type="checkbox" checked={prodForm.is_active} onChange={e=>setProdForm(f=>({...f,is_active:e.target.checked}))}/><label style={{fontSize:11, fontWeight:700}}>{prodForm.is_active ? 'ACTIVE (in stock)' : 'HIDDEN / OUT OF STOCK'}</label></div>
            <input required placeholder="Image URL https://..." value={prodForm.image_url} onChange={e=>setProdForm(f=>({...f,image_url:e.target.value}))}/>
            <textarea placeholder="Description" value={prodForm.description} onChange={e=>setProdForm(f=>({...f,description:e.target.value}))} style={{minHeight:80, border:'2px solid var(--ink)', padding:12, fontFamily:'Syne'}}/>
            <div style={{display:'flex', gap:8}}><button className="btn-black full" type="submit">{editingId? 'SAVE CHANGES' : 'CREATE PRODUCT'}</button>{editingId && <button type="button" className="btn-ghost" onClick={()=>{setEditingId(null); setProdForm({name:'',category:'Tech',price:'',sale_price:'',on_sale:false,stock:'',description:'',image_url:'',is_active:true})}}>CANCEL</button>}</div>
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
</div>
}
createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);