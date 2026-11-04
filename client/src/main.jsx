import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Search, ShoppingBag, ArrowUpRight, Plus, Minus, X, Menu, Check, ShieldCheck, Truck, RotateCcw, PackageCheck, UserRound, MapPin, Clock } from 'lucide-react';
import './styles.css';

const RAW = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '');
const API = RAW.includes('/api') ? RAW : RAW + '/api';

const fallbackProducts = [
 {id:1,name:'Studio Wireless Headphones',category:'Tech',description:'Immersive sound, comfortable fit and all-day battery life. Tuned by Urban Cart Studio.',price:1299,image_url:'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=85',stock:25},
 {id:2,name:'Minimal Desk Lamp',category:'Home',description:'A warm, modern lamp for your workspace or bedside table. Concrete base, warm light.',price:649,image_url:'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=900&q=85',stock:18},
 {id:3,name:'Everyday Canvas Backpack',category:'Lifestyle',description:'A durable everyday backpack with a clean, versatile design. Waxed canvas.',price:899,image_url:'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=85',stock:20},
 {id:4,name:'Classic Sunglasses',category:'Accessories',description:'Timeless frames made for sunny days and daily wear. Polarized.',price:499,image_url:'https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=900&q=85',stock:30},
 {id:5,name:'Smart Watch',category:'Tech',description:'Track your activity and stay connected throughout the day. AMOLED.',price:1599,image_url:'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=85',stock:12},
 {id:6,name:'Ceramic Coffee Set',category:'Home',description:'A considered ceramic set for your everyday coffee ritual. Matte glaze.',price:379,image_url:'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=900&q=85',stock:16},
 {id:7,name:'Everyday Sneakers',category:'Lifestyle',description:'Comfort-first sneakers with a simple, versatile silhouette. Cloud sole.',price:1099,image_url:'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=85',stock:14},
 {id:8,name:'Reusable Travel Bottle',category:'Accessories',description:'A reusable bottle to keep your favourite drink close at hand. Double wall.',price:249,image_url:'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=900&q=85',stock:40}
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

function App(){
 const [products,setProducts]=useState(fallbackProducts),[category,setCategory]=useState('All'),[search,setSearch]=useState(''),[cart,setCart]=useState([]),[cartOpen,setCartOpen]=useState(false),[checkoutOpen,setCheckoutOpen]=useState(false),[notice,setNotice]=useState(''),[loading,setLoading]=useState(true),[menuOpen,setMenuOpen]=useState(false),[accountOpen,setAccountOpen]=useState(false),[authMode,setAuthMode]=useState('login'),[user,setUser]=useState(()=>JSON.parse(localStorage.getItem('uc_user')||'null')),[orders,setOrders]=useState([]),[adminOpen,setAdminOpen]=useState(false),[adminOrders,setAdminOrders]=useState([]),[busy,setBusy]=useState(false),[selectedProduct,setSelectedProduct]=useState(null),[showAll,setShowAll]=useState(false);
 // New: tracking + tabs
 const [activeTab,setActiveTab]=useState('shop');
 const [trackingOrders,setTrackingOrders]=useState([]);
 const [editingOrder,setEditingOrder]=useState(null);
 const [editData,setEditData]=useState({delivery_status:'Order Placed', current_location:'Warehouse - Johannesburg', eta:'2-3 business days', tracking_note:''});

 // Checkout form - NO HARDCODED Raphuti/email, uses user
 const [form,setForm]=useState({full_name:'',email:'',phone:'',address_search:'',delivery_address:'',province:'LIMPOPO',postal_code:''});
 const [authForm,setAuthForm]=useState({name:'',email:'',password:''});
 const [adminTab,setAdminTab]=useState('orders');
 const [prodForm,setProdForm]=useState({name:'',category:'Tech',price:'',stock:'',description:'',image_url:''});
 const [editingId,setEditingId]=useState(null);
 const categories=['All','Tech','Home','Lifestyle','Accessories'];

 // LOAD CART
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
           price: r.price,
           image_url: r.image_url,
           description: r.description || '',
           category: r.category || 'Tech',
           stock: r.stock ?? 99
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
      setNotice(`Payment successful! Order #${params.get('order')} received.`); 
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
     // Prefill from user - NO Raphuti, use real user
     setForm(f=>({
       ...f,
       full_name: user.name || f.full_name,
       email: user.email || f.email
     }));
     api('/orders/mine').then(setOrders).catch(()=>{});
   }
 },[user]);

 useEffect(()=>{if(notice){const t=setTimeout(()=>setNotice(''),5500);return()=>clearTimeout(t);}},[notice]);

 async function loadTracking(){
   try{
     const data = await api('/orders/my-orders');
     setTrackingOrders(data);
     setOrders(data);
   }catch(e){ setNotice(e.message); }
 }

 const visible=useMemo(()=>products.filter(p=>(category==='All'|| (p.category||'').toLowerCase()===category.toLowerCase())&& `${p.name} ${p.description} ${p.category}`.toLowerCase().includes(search.toLowerCase())),[products,category,search]);
 const count = cart.reduce((s,p)=>s+p.quantity,0), total=cart.reduce((s,p)=>s+p.price*p.quantity,0);  
 const setField=(k,v)=>setForm(f=>({...f,[k]:v}));

 async function add(p){
   setCart(old=>{
     const found=old.find(x=>x.id===p.id);
     return found?old.map(x=>x.id===p.id?{...x,quantity:Math.min(x.quantity+1,99)}:x):[...old,{...p,quantity:1}];
   });
   setNotice(`${p.name} added to bag`);
   if(user){
     try{ await api('/cart',{method:'POST', body:JSON.stringify({product_id:p.id, quantity:1})}); }catch(e){ console.log('cart sync error', e.message); }
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

 async function submitAuth(e){
  e.preventDefault(); setBusy(true);
  try{
    const data=await api(`/auth/${authMode}`,{method:'POST',body:JSON.stringify(authForm)});
    const guestKey = getCartKey(null);
    const guestCart = JSON.parse(localStorage.getItem(guestKey) || '[]');
    localStorage.setItem('uc_token',data.token);
    localStorage.setItem('uc_user',JSON.stringify(data.user));
    setUser(data.user);
    setAccountOpen(false); 
    setNotice(`Welcome${data.user.name?`, ${data.user.name.split(' ')[0]}`:''}!`); 
    setAuthForm({name:'',email:'',password:''});
    if(guestCart.length){
      for(const item of guestCart){
        try{ await api('/cart',{method:'POST', body:JSON.stringify({product_id:item.id, quantity:item.quantity})}); }catch{}
      }
      localStorage.removeItem(guestKey);
    }
  }catch(e){setNotice(e.message);} finally{setBusy(false);} 
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
  }catch(e){ setNotice(e.message); }
  finally{ setBusy(false); }
 }

 async function placeOrder(e) {
  e.preventDefault();
  // Validate SA phone + full address to prevent wrong delivery
  if(!form.full_name.trim()||!form.email.trim()||!form.phone.trim()||!form.delivery_address.trim()||!form.province.trim()||!form.postal_code.trim()){
    setNotice('Please fill all: Full Name, Email, SA Phone, Delivery Address, Province, Postal Code'); return;
  }
  if(!isValidSAphone(form.phone)){
    setNotice('Invalid SA phone. Use +27 71 234 5678 or 0712345678 (SA numbers start with 6-8)'); return;
  }
  if(!/^[0-9]{4}$/.test(form.postal_code.trim())){
    setNotice('Postal code must be 4 digits (SA) e.g. 0555'); return;
  }
  if(!cart.length){ setNotice('Your bag is empty.'); return; }
  setBusy(true); setNotice('');
  try {
    const order = await api('/orders',{method:'POST',body:JSON.stringify({
      full_name: form.full_name,
      customer_name: form.full_name,
      email: form.email,
      phone: form.phone,
      address_search: form.address_search,
      delivery_address: form.delivery_address,
      address: form.delivery_address,
      province: form.province,
      postal_code: form.postal_code,
      city: form.delivery_address,
      customer_id: user?.id,
      items: cart.map(p => ({ id: p.id, product_id: p.id, quantity: p.quantity }))
    })});
    const pay = await api('/payfast/checkout',{method:'POST',body:JSON.stringify({ orderId: order.orderId })});
    if (!pay.action || !pay.fields) throw new Error('PayFast is not configured yet on server');
    localStorage.setItem('lastOrderId', order.orderId);
    const formEl = document.createElement('form'); formEl.method='POST'; formEl.action=pay.action; formEl.style.display='none';
    Object.entries(pay.fields).forEach(([name, value]) => { const input=document.createElement('input'); input.type='hidden'; input.name=name; input.value=String(value ?? ''); formEl.appendChild(input); });
    document.body.appendChild(formEl); setCheckoutOpen(false); formEl.submit();
  } catch (err) { setNotice(err.message || 'Could not start PayFast checkout.'); } finally { setBusy(false); }
 }

 async function createProduct(e){
    e.preventDefault();
    try{
      const payload={...prodForm, price:Number(prodForm.price), stock:Number(prodForm.stock)};
      const p = await api('/admin/products',{method:'POST', body:JSON.stringify(payload)});
      setProducts(old=>[p,...old]); setNotice('Product created'); setProdForm({name:'',category:'Tech',price:'',stock:'',description:'',image_url:''});
    }catch(err){setNotice(err.message)}
  }
  async function saveEdit(e){
    e.preventDefault();
    try{
      const payload={...prodForm, price:Number(prodForm.price), stock:Number(prodForm.stock)};
      const p = await api(`/admin/products/${editingId}`,{method:'PUT', body:JSON.stringify(payload)});
      setProducts(old=>old.map(x=>x.id===editingId? p : x));
      setEditingId(null); setProdForm({name:'',category:'Tech',price:'',stock:'',description:'',image_url:''}); setNotice('Product updated');
    }catch(err){setNotice(err.message)}
  }
  function startEdit(p){
    setEditingId(p.id);
    setProdForm({name:p.name, category:p.category||'Tech', price:String(p.price), stock:String(p.stock), description:p.description, image_url:p.image_url});
    setAdminTab('products');
  }
  async function deleteProduct(id){
    if(!confirm('Delete this product?')) return;
    try{ await api(`/admin/products/${id}`,{method:'DELETE'}); setProducts(old=>old.filter(x=>x.id!==id)); setNotice('Product deleted'); }catch(err){setNotice(err.message)}
  }
 async function showAdmin(){try{const data=await api('/admin/orders');setAdminOrders(data);setAdminOpen(true);}catch(e){setNotice(e.message);}}
 async function updateStatus(id,status){try{await api(`/admin/orders/${id}/status`,{method:'PATCH',body:JSON.stringify({status})});setAdminOrders(old=>old.map(o=>o.id===id?{...o,status, delivery_status:status}:o));}catch(e){setNotice(e.message);}}
 async function saveTrackingUpdate(){
   if(!editingOrder) return;
   setBusy(true);
   try{
     await api(`/admin/orders/${editingOrder.id}`,{method:'PUT', body:JSON.stringify(editData)});
     setNotice(`Tracking updated for Order #${editingOrder.id} - customer will see new location`);
     setEditingOrder(null);
     showAdmin();
   }catch(e){ setNotice(e.message); }
   finally{ setBusy(false); }
 }

 const isHome = !selectedProduct && !showAll && activeTab==='shop';
 return <div className="app">
  <div className="ticker"><div className="ticker-track"><span>● FREE DELIVERY OVER R1,000 ● SECURE PAYFAST ● CURATED IN SA ● EVERYDAY ELEVATED ●</span><span>● FREE DELIVERY OVER R1,000 ● SECURE PAYFAST ● CURATED IN SA ● EVERYDAY ELEVATED ●</span></div></div>
  <header className="header">
    <div className="header-left">
      <button className="icon-btn mobile-only" onClick={()=>setMenuOpen(!menuOpen)}><Menu size={20}/></button>
      <a className="brand" href="#" onClick={()=>{setCategory('All');setSearch('');closeProduct();setShowAll(false); setActiveTab('shop');}}>
        <span className="brand-mark">U</span> URBAN CART <i>®</i>
      </a>
      <nav className={menuOpen?'nav open':'nav'}>
        <a onClick={()=>{setShowAll(false); closeProduct(); setCategory('All'); setActiveTab('shop'); setMenuOpen(false); window.scrollTo(0,0)}}>HOME</a>
        <a onClick={()=>{setShowAll(true); closeProduct(); setActiveTab('shop'); setMenuOpen(false); window.scrollTo(0,0)}}>INDEX</a>
        <a onClick={()=>{setActiveTab('track'); loadTracking(); setMenuOpen(false);}}>TRACK ORDER</a>
        <a href="#story" onClick={()=>setMenuOpen(false)}>MANIFESTO</a>
      </nav>
    </div>
    <div className="header-right">
      <label className="search-pill"><Search size={14}/><input value={search} onChange={e=>{setSearch(e.target.value); if(selectedProduct){closeProduct()}}} placeholder="SEARCH"/><kbd>⌘K</kbd></label>
      <button className="circle-btn" onClick={()=>setAccountOpen(true)}><UserRound size={16}/></button>
      <button className="bag-pill" onClick={()=>setCartOpen(true)}><ShoppingBag size={14}/> BAG <b>{count}</b></button>
    </div>
  </header>
  <main>
    {activeTab==='track' ? (
      <section className="shop">
        <div className="shop-head"><h2>MY ORDERS & TRACKING</h2><button className="btn-ghost" onClick={()=>setActiveTab('shop')}>BACK TO SHOP</button></div>
        {!trackingOrders.length && <div className="empty">No orders yet - <button onClick={()=>setActiveTab('shop')}>Start shopping</button><p style={{fontSize:12, marginTop:12}}>Orders appear here after checkout. Track delivery status live.</p></div>}
        {trackingOrders.map(o=>(
          <div key={o.id} style={{border:'2px solid #121212', marginBottom:16, background:'#FFFCF8'}}>
            <div style={{padding:14, borderBottom:'2px solid #121212', display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:8}}>
              <b>Order #{o.id} - {fmt(o.total)} - <span style={{background:'#121212', color:'#C9A87A', padding:'2px 6px'}}>{o.delivery_status || o.status}</span></b>
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
            </div>
          </div>
        ))}
      </section>
    ) : selectedProduct ? (
      <div className="product-view">
        <div className="product-view-left">
          <img src={selectedProduct.image_url} alt={selectedProduct.name}/>
          <div className="img-meta"><span>{selectedProduct.category}</span><span>{selectedProduct.stock} IN STOCK</span></div>
        </div>
        <div className="product-view-right">
          <button className="close-view" onClick={closeProduct}><X size={14}/> CLOSE</button>
          <h1>{selectedProduct.name}</h1>
          <p className="desc">{selectedProduct.description}</p>
          <div className="price-row"><strong>{fmt(selectedProduct.price)}</strong><span>ZAR • VAT INCL.</span></div>
          <div className="buy-row">
            <button className="btn-black" onClick={()=>{add(selectedProduct);}}>
              ADD TO BAG — {fmt(selectedProduct.price)} <ArrowUpRight size={16}/>
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
          <h2>FULL INDEX <span>({visible.length})</span></h2>
          <button className="btn-ghost" onClick={()=>{setShowAll(false); window.scrollTo(0,0)}}><X size={14}/> BACK TO HOME</button>
        </div>
        <div className="grid all-mode">
          {visible.map((p)=>
            <article key={p.id} className="card" onClick={()=>openProduct(p)}>
              <div className="card-img"><img src={p.image_url} alt={p.name} loading="lazy"/><span className="tag">{p.category}</span><button className="add" onClick={e=>{e.stopPropagation(); add(p);}}><Plus size={16}/></button></div>
              <div className="card-info"><div><h3>{p.name}</h3><small>{p.category}</small></div><b>{fmt(p.price)}</b></div>
            </article>
          )}
        </div>
      </section>
    ) : (
      <>
        <section className="hero-grid">
          <div className="hero-manifesto">
            <h1>FIND<br/>YOUR<br/>KIND<br/><em>OF GOOD.</em></h1>
            <p>Not another store. A tight edit of useful, well-made things that earn their place. No filler. No endless scroll.</p>
            <div className="hero-actions">
              <a href="#shop" className="btn-black">SHOP THE INDEX <ArrowUpRight size={16}/></a>
              <div className="hero-stat"><b>{products.length}</b><span>OBJECTS<br/>CURATED</span></div>
            </div>
          </div>
          <div className="hero-cards">
            <div className="hero-big-card">
              <img src="https://images.unsplash.com/photo-1490312278390-ab64016e0aa9?auto=format&fit=crop&w=1200&q=85" alt=""/>
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
            <button className="view-all" onClick={()=>{setShowAll(true); window.scrollTo(0,0)}}>VIEW EVERYTHING <ArrowUpRight size={14}/></button>
          </div>
          {loading&&<div className="loading">LOADING INDEX...</div>}
          {!loading&&!visible.length&&<div className="empty">NO RESULTS FOR "{search}" <button onClick={()=>{setSearch('');setCategory('All')}}>CLEAR</button></div>}
          <div className="grid">
            {visible.map((p,i)=>
              <article key={p.id} className={i===0?"card big":"card"} onClick={()=>openProduct(p)}>
                <div className="card-img"><img src={p.image_url} alt={p.name} loading="lazy"/><span className="tag">{i===0?'BESTSELLER':p.category}</span><button className="add" onClick={e=>{e.stopPropagation(); add(p);}}><Plus size={16}/></button></div>
                <div className="card-info"><div><h3>{p.name}</h3><small>{p.category}</small></div><b>{fmt(p.price)}</b></div>
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
        <div className="cart-list">{cart.map(p=><div key={p.id} className="cart-item"><img src={p.image_url}/><div><h4>{p.name}</h4><b>{fmt(p.price)}</b><div className="qty"><button onClick={()=>changeQty(p.id,-1)}><Minus size={10}/></button><span>{p.quantity}</span><button onClick={()=>changeQty(p.id,1)}><Plus size={10}/></button></div></div><button className="remove" onClick={()=>removeItem(p.id)}>REMOVE</button></div>)}</div>
        <div className="cart-foot"><div className="sum"><span>SUBTOTAL ({count} items)</span><b>{fmt(total)}</b></div><button className="btn-black full" onClick={()=>{setCartOpen(false);setCheckoutOpen(true)}}>CHECKOUT — {fmt(total)} <ArrowUpRight size={14}/></button><button className="btn-ghost full" style={{marginTop:8}} onClick={clearCart}>CLEAR BAG</button></div>
      </>}
    </aside>
  </div>}

  {checkoutOpen&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setCheckoutOpen(false)}}>
    <section className="modal" style={{maxWidth:560, width:'94vw'}}>
      <div className="drawer-head"><h2>DELIVERY DETAILS</h2><button onClick={()=>setCheckoutOpen(false)}><X size={16}/></button></div>

      <div style={{background:'#f7f5f0', border:'2px solid #121212', padding:12, marginBottom:14}}>
        <p style={{fontSize:12, fontWeight:700, margin:'0 0 6px'}}>✓ PCI DSS Secure - Your info is protected</p>
        <p style={{fontSize:11, margin:0}}>We collect full SA address + SA phone to prevent wrong delivery. Like Temu checkout.</p>
      </div>

      <form onSubmit={placeOrder} className="checkout-form" style={{display:'flex', flexDirection:'column', gap:12}}>
        <div>
          <label style={{fontSize:11, fontWeight:700}}>Full Name * (First and Last name)</label>
          <input required placeholder="e.g. John Smith" value={form.full_name} onChange={e=>setField('full_name',e.target.value)} style={{width:'100%', height:44, border:'2px solid #121212', padding:'0 12px', marginTop:4}}/>
        </div>
        <div>
          <label style={{fontSize:11, fontWeight:700, display:'flex', justifyContent:'space-between'}}><span>Phone number *</span><span style={{fontWeight:400, opacity:.6}}>SA only - May be used to assist delivery</span></label>
          <div style={{display:'flex', border:'2px solid #121212', height:44, marginTop:4}}>
            <span style={{background:'#eee', padding:'0 10px', display:'grid', placeItems:'center', fontSize:12, fontWeight:700, borderRight:'2px solid #121212'}}>ZA +27</span>
            <input required value={form.phone} onChange={e=>setField('phone',e.target.value)} placeholder="707 028 041 or 071 234 5678" style={{flex:1, border:0, padding:'0 12px'}}/>
          </div>
          <p style={{fontSize:10, color:'green', margin:'4px 0 0'}}>✓ Your phone number will be kept secure.</p>
        </div>
        <div>
          <label style={{fontSize:11, fontWeight:700}}>Address search</label>
          <p style={{fontSize:10, opacity:.6, margin:'2px 0 4px'}}>Enter your street name or house number to find your full address.</p>
          <input value={form.address_search} onChange={e=>setField('address_search',e.target.value)} placeholder="Search by street or address" style={{width:'100%', height:44, border:'2px solid #121212', padding:'0 12px'}}/>
        </div>
        <div>
          <label style={{fontSize:11, fontWeight:700}}>Delivery address *</label>
          <input required list="sa-addresses" value={form.delivery_address} onChange={e=>setField('delivery_address',e.target.value)} placeholder="e.g. 7940 Lephalale, 123 Main St, Lephalale" style={{width:'100%', height:44, border:'2px solid #121212', padding:'0 12px', marginTop:4}}/>
          <datalist id="sa-addresses">
            <option value="7940 Lephalale Street, Greater Nigel, Nigel, South Africa"/>
            <option value="7940 Lephalale Street, Tshikota, Louis Trichardt, South Africa"/>
            <option value="7940 Lephalale Clos, Lephalale, South Africa"/>
          </datalist>
        </div>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
          <div>
            <label style={{fontSize:11, fontWeight:700}}>Province *</label>
            <select required value={form.province} onChange={e=>setField('province',e.target.value)} style={{width:'100%', height:44, border:'2px solid #121212', padding:'0 12px', marginTop:4}}>
              {PROVINCES.map(p=><option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label style={{fontSize:11, fontWeight:700}}>Postal code *</label>
            <input required value={form.postal_code} onChange={e=>setField('postal_code',e.target.value)} placeholder="0555" style={{width:'100%', height:44, border:'2px solid #121212', padding:'0 12px', marginTop:4}}/>
          </div>
        </div>

        <div style={{border:'2px solid #121212', padding:12, background:'#FFFCF8'}}>
          <h4 style={{margin:'0 0 8px', fontFamily:'Anton', fontSize:13}}>AVAILABLE PAYMENTS - PAYFAST</h4>
          <div style={{display:'flex', flexWrap:'wrap', gap:6, marginBottom:8}}>
            <span style={{border:'1px solid #121212', padding:'4px 8px', fontSize:10, fontWeight:700, background:'#fff'}}>VISA</span>
            <span style={{border:'1px solid #121212', padding:'4px 8px', fontSize:10, fontWeight:700, background:'#fff'}}>MasterCard</span>
            <span style={{border:'1px solid #121212', padding:'4px 8px', fontSize:10, fontWeight:700, background:'#fff'}}>Capitec Pay</span>
            <span style={{border:'1px solid #121212', padding:'4px 8px', fontSize:10, fontWeight:700, background:'#fff'}}>EFT Secure</span>
            <span style={{border:'1px solid #121212', padding:'4px 8px', fontSize:10, fontWeight:700, background:'#fff'}}>Mobicred</span>
            <span style={{border:'1px solid #121212', padding:'4px 8px', fontSize:10, fontWeight:700, background:'#fff'}}>SCode</span>
            <span style={{border:'1px solid #121212', padding:'4px 8px', fontSize:10, fontWeight:700, background:'#fff'}}>Zapper</span>
            <span style={{border:'1px solid #121212', padding:'4px 8px', fontSize:10, fontWeight:700, background:'#fff'}}>SnapScan</span>
          </div>
          <p style={{fontSize:10, margin:0, opacity:.7}}>✓ Temu follows PCI DSS - Card info secure, never sold. All data safeguarded via PayFast.</p>
        </div>

        <div style={{display:'flex', justifyContent:'space-between', fontWeight:700, borderTop:'2px solid #121212', paddingTop:10, fontSize:13}}>
          <span>SUBTOTAL ({count} items)</span><span>{fmt(total)}</span>
        </div>
        <button className="btn-black full" disabled={busy} type="submit" style={{height:48}}>
          {busy?'PREPARING...':`PAY ${fmt(total)} WITH PAYFAST`} <ShieldCheck size={14}/>
        </button>
      </form>
    </section>
  </div>}

  {accountOpen&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setAccountOpen(false)}}>
    <section className="modal">
      <div className="drawer-head"><h2>{user?user.name.toUpperCase():authMode==='login'?'SIGN IN':'CREATE ACCOUNT'}</h2><button onClick={()=>setAccountOpen(false)}><X size={16}/></button></div>
      {user?<div className="account">
        <div className="avatar">{user.name[0]}</div><h3>{user.name}</h3><p>{user.email}</p>
        <div className="orders">
          {orders.slice(0,5).map(o=><div key={o.id} className="order-line"><span>#{o.id} • {new Date(o.created_at).toLocaleDateString()} • {o.delivery_status || o.status}</span><b>{fmt(o.total)} — {o.status}</b></div>)}
          <button className="btn-ghost full" style={{marginTop:8}} onClick={()=>{setAccountOpen(false); setActiveTab('track'); loadTracking();}}>VIEW ALL & TRACK →</button>
        </div>
        <button className="btn-outline full" onClick={logout}>SIGN OUT</button>
        <button className="btn-ghost full" style={{marginTop:10, borderColor:'#ff3b30', color:'#ff3b30', border:'1px solid #ff3b30'}} onClick={deleteAccount} disabled={busy}>
          {busy?'DELETING...':'DELETE MY ACCOUNT'}
        </button>
        <p style={{fontSize:11, color:'#888', marginTop:8, textAlign:'center'}}>This will permanently delete your account, orders and saved bag.</p>
        {user.role==='admin'&&<button className="btn-black full" style={{marginTop:12}} onClick={()=>{setAccountOpen(false);showAdmin()}}>ADMIN ORDERS</button>}
      </div>:<>
        <div className="auth-switch"><button className={authMode==='login'?'on':''} onClick={()=>setAuthMode('login')}>LOGIN</button><button className={authMode==='register'?'on':''} onClick={()=>setAuthMode('register')}>REGISTER</button></div>
        <form onSubmit={submitAuth} className="auth-form">
          {authMode==='register'&&<input required placeholder="Full name" value={authForm.name} onChange={e=>setAuthForm(f=>({...f,name:e.target.value}))}/>}
          <input required type="email" placeholder="Email" value={authForm.email} onChange={e=>setAuthForm(f=>({...f,email:e.target.value}))}/>
          <input required type="password" placeholder="Password" value={authForm.password} onChange={e=>setAuthForm(f=>({...f,password:e.target.value}))}/>
          <button className="btn-black full">{busy?'WAIT...':authMode==='login'?'SIGN IN':'CREATE ACCOUNT'}</button>
        </form>
      </>}
    </section>
  </div>}

  {adminOpen&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setAdminOpen(false)}}>
    <section className="modal wide-modal" style={{maxWidth:820}}>
      <div className="drawer-head"><h2>ADMIN — {adminTab.toUpperCase()}</h2><button onClick={()=>setAdminOpen(false)}><X size={16}/></button></div>
      <div className="auth-switch">
        <button className={adminTab==='orders'?'on':''} onClick={()=>setAdminTab('orders')}>ORDERS ({adminOrders.length})</button>
        <button className={adminTab==='products'?'on':''} onClick={()=>setAdminTab('products')}>PRODUCTS ({products.length})</button>
      </div>
      {adminTab==='orders' ? (
        <div style={{maxHeight:'70vh', overflow:'auto'}}>
          {adminOrders.map(o=>(
            <div key={o.id} style={{border:'2px solid #121212', padding:12, marginBottom:10, background:'#FFFCF8'}}>
              <div style={{display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:6}}>
                <b>#{o.id} {o.customer_name || o.full_name} - {o.email}</b>
                <span style={{fontSize:11, background:'#121212', color:'#C9A87A', padding:'4px 8px'}}>{o.delivery_status || o.status}</span>
              </div>
              <p style={{fontSize:11, margin:'6px 0'}}>📍 {o.delivery_address || o.address}, {o.province}, {o.postal_code} | 📞 {o.phone}</p>
              <p style={{fontSize:11}}>Location: {o.current_location} | ETA: {o.eta}</p>
              <div style={{display:'flex', gap:6, marginTop:8, flexWrap:'wrap'}}>
                <button className="btn-ghost" style={{height:32, fontSize:11}} onClick={()=>{
                  setEditingOrder(o);
                  setEditData({delivery_status:o.delivery_status||o.status, current_location:o.current_location||'Warehouse - Johannesburg', eta:o.eta||'2-3 business days', tracking_note:''});
                }}>UPDATE TRACKING</button>
                <select value={o.status} onChange={e=>updateStatus(o.id,e.target.value)} style={{border:'2px solid #121212', fontSize:11, fontWeight:700, height:32}}>
                  {['pending','paid','processing','shipped','delivered','cancelled'].map(s=><option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div style={{marginTop:6}}>{o.items?.map((it,idx)=><div key={idx} style={{fontSize:10}}>{it.name} x {it.quantity}</div>)}</div>
            </div>
          ))}
          {!adminOrders.length && <div className="empty">NO ORDERS YET</div>}

          {editingOrder && (
            <div className="overlay" style={{zIndex:10001, position:'fixed'}} onMouseDown={e=>{if(e.target===e.currentTarget)setEditingOrder(null)}}>
              <section className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:500}}>
                <div className="drawer-head"><h2>UPDATE ORDER #{editingOrder.id}</h2><button onClick={()=>setEditingOrder(null)}><X size={16}/></button></div>
                <p style={{fontSize:11}}>Customer: {editingOrder.customer_name || editingOrder.full_name} - {editingOrder.delivery_address}</p>
                <div style={{display:'flex', flexDirection:'column', gap:10, marginTop:12}}>
                  <label style={{fontSize:11, fontWeight:700}}>Delivery Status</label>
                  <select value={editData.delivery_status} onChange={e=>setEditData({...editData, delivery_status:e.target.value})} style={{height:42, border:'2px solid #121212'}}>
                    <option>Order Placed</option><option>Processing</option><option>Packed</option><option>Shipped</option><option>Out for Delivery</option><option>Delivered</option><option>Delayed</option>
                  </select>
                  <label style={{fontSize:11, fontWeight:700}}>Current Location (e.g. Warehouse JHB → Polokwane → Lephalale)</label>
                  <input value={editData.current_location} onChange={e=>setEditData({...editData, current_location:e.target.value})} placeholder="e.g. Courier Depot - Polokwane, On route to Lephalale" style={{height:42, border:'2px solid #121212', padding:'0 12px'}}/>
                  <label style={{fontSize:11, fontWeight:700}}>ETA</label>
                  <input value={editData.eta} onChange={e=>setEditData({...editData, eta:e.target.value})} placeholder="e.g. Today by 5pm, Tomorrow, 2-3 days" style={{height:42, border:'2px solid #121212', padding:'0 12px'}}/>
                  <label style={{fontSize:11, fontWeight:700}}>Note to Customer</label>
                  <textarea value={editData.tracking_note} onChange={e=>setEditData({...editData, tracking_note:e.target.value})} placeholder="e.g. Your package left JHB, arriving Limpopo tomorrow 10am" style={{height:80, border:'2px solid #121212', padding:12}}/>
                  <button className="btn-black full" onClick={saveTrackingUpdate} disabled={busy}>{busy?'SAVING...':'SAVE UPDATE'}</button>
                  <button className="btn-ghost full" onClick={()=>setEditingOrder(null)}>CANCEL</button>
                </div>
              </section>
            </div>
          )}
        </div>
      ) : (
        <div>
          <form onSubmit={editingId? saveEdit : createProduct} className="auth-form" style={{padding:16, border:'2px solid var(--ink)', background:'#fff'}}>
            <h3 style={{fontFamily:'Anton', margin:'0 0 8px'}}>{editingId? `EDIT #${editingId}` : 'CREATE NEW PRODUCT'}</h3>
            <input required placeholder="Name" value={prodForm.name} onChange={e=>setProdForm(f=>({...f,name:e.target.value}))}/>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8}}>
              <select value={prodForm.category} onChange={e=>setProdForm(f=>({...f,category:e.target.value}))}>
                {['Tech','Home','Lifestyle','Accessories'].map(c=><option key={c}>{c}</option>)}
              </select>
              <input required type="number" step="0.01" placeholder="Price ZAR" value={prodForm.price} onChange={e=>setProdForm(f=>({...f,price:e.target.value}))}/>
              <input required type="number" placeholder="Stock" value={prodForm.stock} onChange={e=>setProdForm(f=>({...f,stock:e.target.value}))}/>
            </div>
            <input required placeholder="Image URL https://..." value={prodForm.image_url} onChange={e=>setProdForm(f=>({...f,image_url:e.target.value}))}/>
            <textarea placeholder="Description" value={prodForm.description} onChange={e=>setProdForm(f=>({...f,description:e.target.value}))} style={{minHeight:80, border:'2px solid var(--ink)', padding:12, fontFamily:'Syne'}}/>
            <div style={{display:'flex', gap:8}}>
              <button className="btn-black full" type="submit">{editingId? 'SAVE CHANGES' : 'CREATE PRODUCT'}</button>
              {editingId && <button type="button" className="btn-ghost" onClick={()=>{setEditingId(null); setProdForm({name:'',category:'Tech',price:'',stock:'',description:'',image_url:''})}}>CANCEL</button>}
            </div>
          </form>
          <div style={{display:'flex', flexDirection:'column', gap:8, maxHeight:'35vh', overflow:'auto', marginTop:12}}>
            {products.map(p=><div key={p.id} className="admin-row">
              <div style={{display:'flex', gap:10, alignItems:'center'}}>
                <img src={p.image_url} style={{width:48, height:48, objectFit:'cover', border:'1px solid var(--ink)'}}/>
                <div><b>{p.name}</b><small>{p.category} • {fmt(p.price)} • Stock {p.stock}</small></div>
              </div>
              <div style={{display:'flex', gap:6}}>
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